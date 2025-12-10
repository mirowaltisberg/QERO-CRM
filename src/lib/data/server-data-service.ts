/**
 * Server-side Data Service Layer
 * Uses Supabase Server Client for server components and API routes
 */

import type { Contact, ContactFilters, TmaCandidate, TmaFilters } from "../types";
import { createClient } from "../supabase/server";
import { serverPersonalSettingsService } from "./personal-settings-service-server";

// Fields that are personal (stored in user_contact_settings, not on contacts table)
const PERSONAL_CONTACT_FIELDS = ["status", "follow_up_at", "follow_up_note"];

// Supabase has a default max_rows of 1000, so we fetch in batches
const BATCH_SIZE = 1000;

/**
 * Server-side Contact Operations
 * Use this in server components (pages, layouts)
 */
export const serverContactService = {
  /**
   * Get all contacts (up to 10k) - for server components
   * Fetches in batches to work around Supabase 1000 row limit
   * Merges personal settings (status, follow_up_at, follow_up_note) for current user
   */
  async getAll(filters?: ContactFilters): Promise<Contact[]> {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("[Server Data] User auth check:", { 
      hasUser: !!user, 
      userId: user?.id,
      authError: authError?.message 
    });
    
    // First get the total count
    let countQuery = supabase
      .from("contacts")
      .select("*", { count: "exact", head: true });

    if (filters?.status) {
      countQuery = countQuery.eq("status", filters.status);
    }
    if (filters?.canton) {
      countQuery = countQuery.eq("canton", filters.canton);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      countQuery = countQuery.or(
        `company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { count } = await countQuery;
    const totalCount = count ?? 0;

    if (totalCount === 0) {
      return [];
    }

    // Fetch in batches using range()
    const allContacts: Contact[] = [];
    const batches = Math.ceil(totalCount / BATCH_SIZE);

    for (let i = 0; i < batches; i++) {
      const from = i * BATCH_SIZE;
      const to = from + BATCH_SIZE - 1;

      let query = supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.canton) {
        query = query.eq("canton", filters.canton);
      }
      if (filters?.search) {
        const search = filters.search.toLowerCase();
        query = query.or(
          `company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`
        );
      }
      if (filters?.list_id) {
        const { data: members } = await supabase
          .from("list_members")
          .select("contact_id")
          .eq("list_id", filters.list_id);
        
        const contactIds = members?.map((m) => m.contact_id) || [];
        if (contactIds.length > 0) {
          query = query.in("id", contactIds);
        } else {
          return [];
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Error fetching contacts batch ${i + 1}:`, error);
        continue;
      }

      if (data) {
        allContacts.push(...data);
      }
    }

    // Merge personal settings for current user
    if (user && allContacts.length > 0) {
      console.log("[Server Data] Merging personal settings for user:", user.id);
      const contactIds = allContacts.map((c) => c.id);
      
      // Fetch personal settings for all contacts in batches
      const settingsMap: Record<string, any> = {};
      const settingsBatches = Math.ceil(contactIds.length / BATCH_SIZE);
      
      for (let i = 0; i < settingsBatches; i++) {
        const batchIds = contactIds.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const { data: settings, error } = await supabase
          .from("user_contact_settings")
          .select("*")
          .eq("user_id", user.id)
          .in("contact_id", batchIds);
        
        if (error) {
          console.error("[Server Data] Error fetching personal settings:", error);
        }
        
        if (settings) {
          console.log(`[Server Data] Found ${settings.length} personal settings in batch ${i + 1}`);
          for (const setting of settings) {
            settingsMap[setting.contact_id] = setting;
          }
        }
      }
      
      console.log(`[Server Data] Total personal settings found: ${Object.keys(settingsMap).length}`);
      
      // Merge personal settings into contacts
      return allContacts.map((contact) => {
        const personalSettings = settingsMap[contact.id];
        if (personalSettings) {
          return {
            ...contact,
            status: personalSettings.status ?? contact.status,
            follow_up_at: personalSettings.follow_up_at ?? contact.follow_up_at,
            follow_up_note: personalSettings.follow_up_note ?? contact.follow_up_note,
          };
        }
        return contact;
      });
    } else {
      console.log("[Server Data] No user authenticated or no contacts to merge");
    }

    return allContacts;
  },

  /**
   * Get total count of contacts
   */
  async getCount(filters?: ContactFilters): Promise<number> {
    const supabase = await createClient();
    
    let query = supabase
      .from("contacts")
      .select("*", { count: "exact", head: true });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.canton) {
      query = query.eq("canton", filters.canton);
    }

    const { count, error } = await query;

    if (error) {
      console.error("Error counting contacts:", error);
      return 0;
    }

    return count ?? 0;
  },

  /**
   * Get a single contact by ID (with personal settings merged)
   */
  async getById(id: string): Promise<Contact | null> {
    const supabase = await createClient();
    
    // First check auth
    const { data: { user } } = await supabase.auth.getUser();
    console.log("[Server Data] getById - auth check:", { hasUser: !!user, userId: user?.id });
    
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("[Server Data] Error fetching contact:", error);
      return null;
    }

    // Merge with personal settings
    const personalSetting = await serverPersonalSettingsService.getContactSetting(id);
    console.log("[Server Data] getById - personal setting found:", {
      contactId: id,
      personalSetting,
      hasPersonalSetting: !!personalSetting,
    });
    
    if (personalSetting) {
      const merged = {
        ...data,
        status: personalSetting.status ?? data.status,
        follow_up_at: personalSetting.follow_up_at ?? data.follow_up_at,
        follow_up_note: personalSetting.follow_up_note ?? data.follow_up_note,
      };
      console.log("[Server Data] getById - merged result:", {
        status: merged.status,
        follow_up_at: merged.follow_up_at,
      });
      return merged;
    }
    
    return data;
  },

  /**
   * Update a contact (server-side - for API routes)
   */
  async update(id: string, data: Partial<Contact>): Promise<Contact | null> {
    const supabase = await createClient();
    console.log("[Server Data Service] Update called with:", { id, data });
    
    // Separate personal fields from shared fields
    const personalFields: Record<string, unknown> = {};
    const sharedFields: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (PERSONAL_CONTACT_FIELDS.includes(key)) {
        personalFields[key] = value;
      } else {
        sharedFields[key] = value;
      }
    }
    
    // Update shared fields on contacts table (if any)
    if (Object.keys(sharedFields).length > 0) {
      const { error } = await supabase
        .from("contacts")
        .update(sharedFields)
        .eq("id", id);

      if (error) {
        console.error("[Server Data Service] Error updating contact:", error);
        return null;
      }
    }
    
    // Update personal fields (if any) using server personal settings service
    if (Object.keys(personalFields).length > 0) {
      console.log("[Server Data Service] Calling serverPersonalSettingsService with:", { id, personalFields });
      const result = await serverPersonalSettingsService.updateContactSettings(id, personalFields as {
        status?: "hot" | "working" | "follow_up" | null;
        follow_up_at?: string | null;
        follow_up_note?: string | null;
      });
      
      if (!result) {
        console.error("[Server Data Service] ❌ FAILED to save personal settings! This is critical.");
      } else {
        console.log("[Server Data Service] ✅ Personal settings saved successfully:", result);
      }
    } else {
      console.log("[Server Data Service] No personal fields to update");
    }

    // Fetch and return the updated contact with merged personal settings
    const updated = await this.getById(id);
    console.log("[Server Data Service] Returning updated contact:", { 
      id, 
      status: updated?.status,
      follow_up_at: updated?.follow_up_at 
    });
    return updated;
  },

  /**
   * Create a new contact (server-side - for API routes)
   */
  async create(data: Omit<Contact, "id" | "created_at">): Promise<Contact> {
    const supabase = await createClient();
    
    // Separate personal fields from shared fields
    const personalFields = {
      status: data.status,
      follow_up_at: data.follow_up_at,
      follow_up_note: data.follow_up_note,
    };
    
    // Remove personal fields from contact data using destructuring
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status: _s, follow_up_at: _fa, follow_up_note: _fn, ...contactData } = data;
    
    const { data: newContact, error } = await supabase
      .from("contacts")
      .insert(contactData)
      .select()
      .single();

    if (error) {
      console.error("[Server Data Service] Error creating contact:", error);
      throw new Error(error.message);
    }

    // Save personal settings if any were provided (using server service)
    if (personalFields.status || personalFields.follow_up_at) {
      await serverPersonalSettingsService.updateContactSettings(newContact.id, personalFields);
    }

    // Return with merged personal settings
    const personalSetting = await serverPersonalSettingsService.getContactSetting(newContact.id);
    if (personalSetting) {
      return {
        ...newContact,
        status: personalSetting.status ?? newContact.status,
        follow_up_at: personalSetting.follow_up_at ?? newContact.follow_up_at,
        follow_up_note: personalSetting.follow_up_note ?? newContact.follow_up_note,
      };
    }
    return newContact;
  },

  /**
   * Delete a contact
   */
  async delete(id: string): Promise<boolean> {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[Server Data Service] Error deleting contact:", error);
      return false;
    }

    return true;
  },
};

export const serverTmaService = {
  /**
   * Get all TMA candidates (up to 100k) - for server components
   * Fetches in batches to work around Supabase 1000 row limit
   */
  async getAll(filters?: TmaFilters): Promise<TmaCandidate[]> {
    const supabase = await createClient();

    // First get the total count
    let countQuery = supabase
      .from("tma_candidates")
      .select("*", { count: "exact", head: true });

    if (filters?.status) {
      countQuery = countQuery.eq("status", filters.status);
    }
    if (filters?.canton) {
      countQuery = countQuery.eq("canton", filters.canton);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      countQuery = countQuery.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { count } = await countQuery;
    const totalCount = count ?? 0;
    console.log(`[TMA Service] Total count: ${totalCount}`);

    if (totalCount === 0) {
      return [];
    }

    // Fetch in batches using range()
    const allCandidates: TmaCandidate[] = [];
    const batches = Math.ceil(totalCount / BATCH_SIZE);

    for (let i = 0; i < batches; i++) {
      const from = i * BATCH_SIZE;
      const to = from + BATCH_SIZE - 1;

      let query = supabase
        .from("tma_candidates")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.canton) {
        query = query.eq("canton", filters.canton);
      }
      if (filters?.search) {
        const search = filters.search.toLowerCase();
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error(`[TMA Service] Error fetching batch ${i + 1}/${batches}:`, error);
        continue;
      }

      if (data) {
        allCandidates.push(...data);
      }
    }

    console.log(`[TMA Service] Fetched ${allCandidates.length} candidates in ${batches} batches`);
    return allCandidates;
  },
};
