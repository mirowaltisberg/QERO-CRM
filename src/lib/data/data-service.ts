/**
 * Data Service Layer
 * Uses Supabase for all data operations
 * Personal settings (status, follow_up) are stored in user_contact_settings / user_tma_settings
 */

import type {
  Contact,
  CallLog,
  List,
  ContactFilters,
  DashboardStats,
  PaginatedContacts,
  TmaCandidate,
  TmaFilters,
} from "../types";
import type { CallOutcome, TmaStatus } from "../utils/constants";
import type { TmaCreateInput } from "../validation/schemas";
import { createClient } from "../supabase/client";
import { personalSettingsService } from "./personal-settings-service";

// Default page size - can handle up to 10k+ with pagination
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

// Fields that are personal (stored in user_contact_settings, not on contacts table)
const PERSONAL_CONTACT_FIELDS = ["status", "follow_up_at", "follow_up_note"];

/**
 * Helper to merge contacts with personal settings
 */
async function mergeContactsWithPersonalSettings(contacts: Contact[]): Promise<Contact[]> {
  if (contacts.length === 0) return [];
  
  const contactIds = contacts.map(c => c.id);
  const settings = await personalSettingsService.getContactSettings(contactIds);
  
  return contacts.map(contact => ({
    ...contact,
    // Override with personal settings if they exist
    status: settings[contact.id]?.status ?? null,
    follow_up_at: settings[contact.id]?.follow_up_at ?? null,
    follow_up_note: settings[contact.id]?.follow_up_note ?? null,
  }));
}

/**
 * Helper to merge a single contact with personal settings
 */
async function mergeContactWithPersonalSettings(contact: Contact): Promise<Contact> {
  const setting = await personalSettingsService.getContactSetting(contact.id);
  return {
    ...contact,
    status: setting?.status ?? null,
    follow_up_at: setting?.follow_up_at ?? null,
    follow_up_note: setting?.follow_up_note ?? null,
  };
}

/**
 * Contact Operations
 */
export const contactService = {
  /**
   * Get all contacts (up to 10k) - for backwards compatibility
   * For large datasets, use getPaginated instead
   */
  async getAll(filters?: ContactFilters): Promise<Contact[]> {
    const supabase = createClient();
    
    let query = supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10000);

    // NOTE: Status filter now needs to work differently since status is personal
    // We'll filter after merging with personal settings

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
      console.error("Error fetching contacts:", error);
      return [];
    }

    // Merge with personal settings
    let contacts = await mergeContactsWithPersonalSettings(data || []);
    
    // Apply status filter after merging (since status is now personal)
    if (filters?.status) {
      contacts = contacts.filter(c => c.status === filters.status);
    }

    return contacts;
  },

  /**
   * Get paginated contacts with filters
   */
  async getPaginated(filters?: ContactFilters): Promise<PaginatedContacts> {
    const supabase = createClient();
    
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;

    // For status filtering, we need a different approach since status is personal
    // If filtering by status, we fetch more and filter client-side
    const isStatusFilter = !!filters?.status;

    let countQuery = supabase
      .from("contacts")
      .select("*", { count: "exact", head: true });

    let dataQuery = supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });
    
    // If no status filter, use normal pagination
    if (!isStatusFilter) {
      dataQuery = dataQuery.range(offset, offset + pageSize - 1);
    }

    if (filters?.canton) {
      countQuery = countQuery.eq("canton", filters.canton);
      dataQuery = dataQuery.eq("canton", filters.canton);
    }

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      const searchFilter = `company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`;
      countQuery = countQuery.or(searchFilter);
      dataQuery = dataQuery.or(searchFilter);
    }

    if (filters?.list_id) {
      const { data: members } = await supabase
        .from("list_members")
        .select("contact_id")
        .eq("list_id", filters.list_id);
      
      const contactIds = members?.map((m) => m.contact_id) || [];
      if (contactIds.length > 0) {
        countQuery = countQuery.in("id", contactIds);
        dataQuery = dataQuery.in("id", contactIds);
      } else {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
      }
    }

    const [countResult, dataResult] = await Promise.all([
      countQuery,
      dataQuery,
    ]);

    if (dataResult.error) {
      console.error("Error fetching contacts:", dataResult.error);
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }

    // Merge with personal settings
    let contacts = await mergeContactsWithPersonalSettings(dataResult.data || []);
    
    // Apply status filter and paginate after merging
    if (isStatusFilter) {
      contacts = contacts.filter(c => c.status === filters.status);
      const total = contacts.length;
      const totalPages = Math.ceil(total / pageSize);
      const paginatedContacts = contacts.slice(offset, offset + pageSize);
      return { data: paginatedContacts, total, page, pageSize, totalPages };
    }

    const total = countResult.count ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    return {
      data: contacts,
      total,
      page,
      pageSize,
      totalPages,
    };
  },

  /**
   * Get a single contact by ID
   */
  async getById(id: string): Promise<Contact | null> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching contact:", error);
      return null;
    }

    // Merge with personal settings
    return mergeContactWithPersonalSettings(data);
  },

  /**
   * Create a new contact
   */
  async create(data: Omit<Contact, "id" | "created_at">): Promise<Contact> {
    const supabase = createClient();
    
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
      console.error("Error creating contact:", error);
      throw new Error(error.message);
    }

    // Save personal settings if any were provided
    if (personalFields.status || personalFields.follow_up_at) {
      await personalSettingsService.updateContactSettings(newContact.id, personalFields);
    }

    return mergeContactWithPersonalSettings(newContact);
  },

  /**
   * Update a contact
   */
  async update(id: string, data: Partial<Contact>): Promise<Contact | null> {
    const supabase = createClient();
    console.log("[Data Service] Update called with:", { id, data });
    
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
        console.error("Error updating contact:", error);
        return null;
      }
    }
    
    // Update personal fields (if any)
    if (Object.keys(personalFields).length > 0) {
      console.log("[Data Service] Calling updateContactSettings with:", { id, personalFields });
      await personalSettingsService.updateContactSettings(id, personalFields as {
        status?: "hot" | "working" | "follow_up" | null;
        follow_up_at?: string | null;
        follow_up_note?: string | null;
      });
    } else {
      console.log("[Data Service] No personal fields to update");
    }

    // Fetch and return the updated contact
    return this.getById(id);
  },

  /**
   * Delete a contact
   */
  async delete(id: string): Promise<boolean> {
    const supabase = createClient();
    
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting contact:", error);
      return false;
    }

    return true;
  },

  /**
   * Bulk update contacts (personal settings only)
   */
  async bulkUpdate(
    ids: string[],
    data: Partial<Pick<Contact, "status" | "follow_up_at" | "follow_up_note">>
  ): Promise<number> {
    let updated = 0;
    const payload = { ...data };
    
    // Clear follow-up when status is not follow_up
    if (payload.status !== undefined && payload.status !== "follow_up") {
      payload.follow_up_at = null;
      payload.follow_up_note = null;
    }

    for (const id of ids) {
      const result = await personalSettingsService.updateContactSettings(id, payload);
      if (result) {
        updated++;
      }
    }

    return updated;
  },

  /**
   * Bulk delete contacts
   */
  async bulkDelete(ids: string[]): Promise<number> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("contacts")
      .delete()
      .in("id", ids)
      .select();

    if (error) {
      console.error("Error bulk deleting contacts:", error);
      return 0;
    }

    return data?.length || 0;
  },
};

/**
 * Call Log Operations
 */
export const callLogService = {
  async getByContactId(contactId: string): Promise<CallLog[]> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("call_logs")
      .select("*")
      .eq("contact_id", contactId)
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("Error fetching call logs:", error);
      return [];
    }

    return data || [];
  },

  async create(data: {
    contact_id: string;
    outcome: CallOutcome;
    notes?: string;
  }): Promise<CallLog> {
    const supabase = createClient();
    
    const { data: newLog, error } = await supabase
      .from("call_logs")
      .insert({
        contact_id: data.contact_id,
        outcome: data.outcome,
        notes: data.notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating call log:", error);
      throw new Error(error.message);
    }

    // Update last_call on contact (shared field)
    const contactUpdates: Partial<Contact> = {
      last_call: newLog.timestamp,
      ...(data.notes && { notes: data.notes }),
    };

    await supabase
      .from("contacts")
      .update(contactUpdates)
      .eq("id", data.contact_id);

    return newLog;
  },

  async getAll(): Promise<CallLog[]> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("call_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("Error fetching all call logs:", error);
      return [];
    }

    return data || [];
  },
};

/**
 * List Operations
 */
export const listService = {
  async getAll(): Promise<List[]> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("lists")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching lists:", error);
      return [];
    }

    return data || [];
  },

  async getById(id: string): Promise<List | null> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("lists")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching list:", error);
      return null;
    }

    return data;
  },

  async create(data: Omit<List, "id" | "created_at">): Promise<List> {
    const supabase = createClient();
    
    const { data: newList, error } = await supabase
      .from("lists")
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error("Error creating list:", error);
      throw new Error(error.message);
    }

    return newList;
  },

  async addContacts(listId: string, contactIds: string[]): Promise<number> {
    const supabase = createClient();
    let added = 0;

    for (const contactId of contactIds) {
      const { error } = await supabase
        .from("list_members")
        .insert({ list_id: listId, contact_id: contactId })
        .select();

      if (!error) {
        added++;
      }
    }

    return added;
  },

  async removeContacts(listId: string, contactIds: string[]): Promise<number> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("list_members")
      .delete()
      .eq("list_id", listId)
      .in("contact_id", contactIds)
      .select();

    if (error) {
      console.error("Error removing contacts from list:", error);
      return 0;
    }

    return data?.length || 0;
  },

  async getContactCount(listId: string): Promise<number> {
    const supabase = createClient();
    
    const { count, error } = await supabase
      .from("list_members")
      .select("*", { count: "exact", head: true })
      .eq("list_id", listId);

    if (error) {
      console.error("Error counting list contacts:", error);
      return 0;
    }

    return count || 0;
  },
};

/**
 * TMA Candidate Operations
 * Personal settings (status, follow_up) stored in user_tma_settings
 */

// Fields that are personal for TMA
const PERSONAL_TMA_FIELDS = ["status", "status_tags", "follow_up_at", "follow_up_note"];

async function mergeTmaWithPersonalSettings(tma: TmaCandidate): Promise<TmaCandidate> {
  const setting = await personalSettingsService.getTmaSetting(tma.id);
  return {
    ...tma,
    status: setting?.status ?? null,
    status_tags: setting?.status ? [setting.status] : [],
    follow_up_at: setting?.follow_up_at ?? null,
    follow_up_note: setting?.follow_up_note ?? null,
  };
}

async function mergeTmasWithPersonalSettings(tmas: TmaCandidate[]): Promise<TmaCandidate[]> {
  if (tmas.length === 0) return [];
  
  const tmaIds = tmas.map(t => t.id);
  const settings = await personalSettingsService.getTmaSettings(tmaIds);
  
  return tmas.map(tma => ({
    ...tma,
    status: settings[tma.id]?.status ?? null,
    status_tags: settings[tma.id]?.status ? [settings[tma.id].status!] : [],
    follow_up_at: settings[tma.id]?.follow_up_at ?? null,
    follow_up_note: settings[tma.id]?.follow_up_note ?? null,
  }));
}

export const tmaService = {
  async getAll(filters?: TmaFilters): Promise<TmaCandidate[]> {
    const supabase = createClient();
    let query = supabase
      .from("tma_candidates")
      .select(`
        *,
        claimer:profiles!claimed_by(id, full_name, avatar_url)
      `)
      .order("created_at", { ascending: false });

    // Status filter will be applied after merging with personal settings

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
      console.error("Error fetching TMA candidates:", error);
      return [];
    }
    
    // Merge with personal settings
    let tmas = await mergeTmasWithPersonalSettings(data ?? []);
    
    // Apply status filter after merging
    if (filters?.status) {
      tmas = tmas.filter(t => t.status === filters.status || t.status_tags?.includes(filters.status!));
    }
    
    return tmas;
  },

  async getById(id: string): Promise<TmaCandidate | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tma_candidates")
      .select(`
        *,
        claimer:profiles!claimed_by(id, full_name, avatar_url)
      `)
      .eq("id", id)
      .single();
    if (error) {
      console.error("Error fetching TMA candidate:", error);
      return null;
    }
    return mergeTmaWithPersonalSettings(data);
  },

  async create(data: TmaCreateInput): Promise<TmaCandidate> {
    const supabase = createClient();
    
    // Separate personal fields
    const personalFields = {
      status: data.status_tags?.[0] ?? data.status ?? null,
      follow_up_at: data.follow_up_at,
      follow_up_note: data.follow_up_note,
    };
    
    // Remove personal fields from TMA data using destructuring
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status: _s, status_tags: _st, follow_up_at: _fa, follow_up_note: _fn, ...tmaData } = data;
    
    const { data: created, error } = await supabase
      .from("tma_candidates")
      .insert(tmaData)
      .select(`
        *,
        claimer:profiles!claimed_by(id, full_name, avatar_url)
      `)
      .single();
    if (error) {
      console.error("Error creating TMA candidate:", error);
      throw new Error(error.message);
    }
    
    // Save personal settings if any
    if (personalFields.status || personalFields.follow_up_at) {
      await personalSettingsService.updateTmaSettings(created.id, personalFields as {
        status?: "A" | "B" | "C" | null;
        follow_up_at?: string | null;
        follow_up_note?: string | null;
      });
    }
    
    return mergeTmaWithPersonalSettings(created);
  },

  async update(id: string, data: Partial<TmaCandidate>): Promise<TmaCandidate | null> {
    const supabase = createClient();
    
    // Separate personal fields from shared fields
    const personalFields: Record<string, unknown> = {};
    const sharedFields: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (PERSONAL_TMA_FIELDS.includes(key)) {
        personalFields[key] = value;
      } else {
        sharedFields[key] = value;
      }
    }
    
    // Handle status_tags -> status conversion for personal settings
    if (personalFields.status_tags) {
      const tags = personalFields.status_tags as string[];
      personalFields.status = tags[0] ?? null;
      delete personalFields.status_tags;
    }
    
    // Update shared fields on tma_candidates table (if any)
    if (Object.keys(sharedFields).length > 0) {
      const { error: updateError } = await supabase
        .from("tma_candidates")
        .update(sharedFields)
        .eq("id", id);
      
      if (updateError) {
        console.error("Error updating TMA candidate:", updateError);
        return null;
      }
    }
    
    // Update personal fields (if any)
    if (Object.keys(personalFields).length > 0) {
      await personalSettingsService.updateTmaSettings(id, personalFields as {
        status?: "A" | "B" | "C" | null;
        follow_up_at?: string | null;
        follow_up_note?: string | null;
      });
    }
    
    return this.getById(id);
  },

  async delete(id: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from("tma_candidates").delete().eq("id", id);
    if (error) {
      console.error("Error deleting TMA candidate:", error);
      return false;
    }
    return true;
  },

  async bulkUpdate(ids: string[], status: TmaStatus): Promise<void> {
    const payload = {
      status: status || null,
      ...(status !== "C" ? { follow_up_at: null, follow_up_note: null } : {}),
    };
    
    await Promise.all(
      ids.map((id) => personalSettingsService.updateTmaSettings(id, payload))
    );
  },
};

/**
 * Dashboard Statistics
 */
export const statsService = {
  async getDashboardStats(): Promise<DashboardStats> {
    const supabase = createClient();
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const { data: allLogs } = await supabase
      .from("call_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    const logs = allLogs || [];

    const callsToday = logs.filter(
      (log) => new Date(log.timestamp) >= todayStart
    ).length;

    const callsThisWeek = logs.filter(
      (log) => new Date(log.timestamp) >= weekStart
    ).length;

    // Get current user's follow-ups count from personal settings
    const { count: followUpsDue } = await supabase
      .from("user_contact_settings")
      .select("*", { count: "exact", head: true })
      .eq("status", "follow_up")
      .not("follow_up_at", "is", null);

    const successfulOutcomes = logs.filter(
      (log) => log.outcome === "interested" || log.outcome === "meeting_set"
    ).length;
    const conversionRate = logs.length > 0
      ? Math.round((successfulOutcomes / logs.length) * 100)
      : 0;

    const { data: lists } = await supabase
      .from("lists")
      .select("*");

    const topLists = await Promise.all(
      (lists || []).map(async (list) => {
        const contactCount = await listService.getContactCount(list.id);
        
        const { data: members } = await supabase
          .from("list_members")
          .select("contact_id")
          .eq("list_id", list.id);
        
        const contactIds = members?.map((m) => m.contact_id) || [];
        const callCount = logs.filter((log) =>
          contactIds.includes(log.contact_id)
        ).length;

        return {
          id: list.id,
          name: list.name,
          contactCount,
          callCount,
        };
      })
    );

    const daysBack = 14;
    const callTrend = Array.from({ length: daysBack }).map((_, index) => {
      const day = new Date(todayStart);
      day.setDate(day.getDate() - (daysBack - index - 1));
      const key = day.toISOString().slice(0, 10);
      const count = logs.filter(
        (log) => log.timestamp.slice(0, 10) === key
      ).length;
      return { date: key, count };
    });

    // Get current user's follow-up contacts
    const { data: followUpSettings } = await supabase
      .from("user_contact_settings")
      .select("contact_id")
      .eq("status", "follow_up")
      .order("follow_up_at", { ascending: true })
      .limit(5);
    
    const followUpContactIds = followUpSettings?.map(s => s.contact_id) || [];
    let followUps: Contact[] = [];
    
    if (followUpContactIds.length > 0) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("*")
        .in("id", followUpContactIds);
      
      followUps = await mergeContactsWithPersonalSettings(contacts || []);
    }

    return {
      callsToday,
      callsThisWeek,
      followUpsDue: followUpsDue ?? 0,
      conversionRate,
      topLists: topLists.sort((a, b) => b.contactCount - a.contactCount),
      callTrend,
      followUps,
    };
  },
};
