/**
 * Server-side Personal Settings Service
 * Uses Supabase Server Client for API routes and server components
 * 
 * This is the SERVER version - use this in API routes and server components.
 * The browser version (personal-settings-service.ts) uses the browser client.
 */

import { createClient } from "../supabase/server";
import type { PersonalContactSettings, PersonalTmaSettings } from "./personal-settings-service";

export const serverPersonalSettingsService = {
  /**
   * Get personal settings for multiple contacts (for the current user)
   */
  async getContactSettings(contactIds: string[]): Promise<Record<string, PersonalContactSettings>> {
    if (contactIds.length === 0) return {};
    
    const supabase = await createClient();
    
    // Get current user first
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[Server Personal Settings] No user authenticated:", authError?.message);
      return {};
    }
    
    const { data, error } = await supabase
      .from("user_contact_settings")
      .select("*")
      .eq("user_id", user.id)
      .in("contact_id", contactIds);

    if (error) {
      console.error("[Server Personal Settings] Error fetching contact settings:", error);
      return {};
    }

    // Index by contact_id for easy lookup
    const settingsMap: Record<string, PersonalContactSettings> = {};
    for (const setting of data || []) {
      settingsMap[setting.contact_id] = setting;
    }
    
    console.log(`[Server Personal Settings] Found ${Object.keys(settingsMap).length} settings for user ${user.id}`);
    return settingsMap;
  },

  /**
   * Get personal settings for a single contact
   */
  async getContactSetting(contactId: string): Promise<PersonalContactSettings | null> {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[Server Personal Settings] No user authenticated:", authError?.message);
      return null;
    }
    
    const { data, error } = await supabase
      .from("user_contact_settings")
      .select("*")
      .eq("user_id", user.id)
      .eq("contact_id", contactId)
      .maybeSingle();

    if (error) {
      console.error("[Server Personal Settings] Error fetching contact setting:", error);
      return null;
    }
    return data;
  },

  /**
   * Update personal settings for a contact (upsert)
   */
  async updateContactSettings(
    contactId: string,
    settings: Partial<Pick<PersonalContactSettings, "status" | "follow_up_at" | "follow_up_note">>
  ): Promise<PersonalContactSettings | null> {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[Server Personal Settings] No user authenticated:", authError?.message);
      return null;
    }

    console.log("[Server Personal Settings] Updating contact settings:", {
      contactId,
      userId: user.id,
      settings,
    });

    const { data, error } = await supabase
      .from("user_contact_settings")
      .upsert({
        user_id: user.id,
        contact_id: contactId,
        ...settings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,contact_id",
      })
      .select()
      .single();

    if (error) {
      console.error("[Server Personal Settings] Error updating contact settings:", {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }
    
    console.log("[Server Personal Settings] Successfully updated:", data);
    return data;
  },

  /**
   * Clear follow-up for a contact
   */
  async clearContactFollowUp(contactId: string): Promise<boolean> {
    const result = await this.updateContactSettings(contactId, {
      follow_up_at: null,
      follow_up_note: null,
    });
    return result !== null;
  },

  /**
   * Clear status for a contact
   */
  async clearContactStatus(contactId: string): Promise<boolean> {
    const result = await this.updateContactSettings(contactId, {
      status: null,
    });
    return result !== null;
  },

  // ============ TMA Settings ============

  /**
   * Get personal settings for multiple TMA candidates (for the current user)
   */
  async getTmaSettings(tmaIds: string[]): Promise<Record<string, PersonalTmaSettings>> {
    if (tmaIds.length === 0) return {};
    
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[Server Personal Settings] No user authenticated:", authError?.message);
      return {};
    }
    
    const { data, error } = await supabase
      .from("user_tma_settings")
      .select("*")
      .eq("user_id", user.id)
      .in("tma_id", tmaIds);

    if (error) {
      console.error("[Server Personal Settings] Error fetching TMA settings:", error);
      return {};
    }

    // Index by tma_id for easy lookup
    const settingsMap: Record<string, PersonalTmaSettings> = {};
    for (const setting of data || []) {
      settingsMap[setting.tma_id] = setting;
    }
    return settingsMap;
  },

  /**
   * Get personal settings for a single TMA candidate
   */
  async getTmaSetting(tmaId: string): Promise<PersonalTmaSettings | null> {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[Server Personal Settings] No user authenticated:", authError?.message);
      return null;
    }
    
    const { data, error } = await supabase
      .from("user_tma_settings")
      .select("*")
      .eq("user_id", user.id)
      .eq("tma_id", tmaId)
      .maybeSingle();

    if (error) {
      console.error("[Server Personal Settings] Error fetching TMA setting:", error);
      return null;
    }
    return data;
  },

  /**
   * Update personal settings for a TMA candidate (upsert)
   */
  async updateTmaSettings(
    tmaId: string,
    settings: Partial<Pick<PersonalTmaSettings, "status" | "follow_up_at" | "follow_up_note">>
  ): Promise<PersonalTmaSettings | null> {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[Server Personal Settings] No user authenticated:", authError?.message);
      return null;
    }

    console.log("[Server Personal Settings] Updating TMA settings:", {
      tmaId,
      userId: user.id,
      settings,
    });

    const { data, error } = await supabase
      .from("user_tma_settings")
      .upsert({
        user_id: user.id,
        tma_id: tmaId,
        ...settings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,tma_id",
      })
      .select()
      .single();

    if (error) {
      console.error("[Server Personal Settings] Error updating TMA settings:", {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }
    
    console.log("[Server Personal Settings] Successfully updated:", data);
    return data;
  },

  /**
   * Clear follow-up for a TMA candidate
   */
  async clearTmaFollowUp(tmaId: string): Promise<boolean> {
    const result = await this.updateTmaSettings(tmaId, {
      follow_up_at: null,
      follow_up_note: null,
    });
    return result !== null;
  },

  /**
   * Clear status for a TMA candidate
   */
  async clearTmaStatus(tmaId: string): Promise<boolean> {
    const result = await this.updateTmaSettings(tmaId, {
      status: null,
    });
    return result !== null;
  },
};
