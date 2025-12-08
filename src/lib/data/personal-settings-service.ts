/**
 * Personal Settings Service
 * Handles per-user follow-up and status settings for contacts and TMA
 */

import { createClient } from "../supabase/client";

export interface PersonalContactSettings {
  user_id: string;
  contact_id: string;
  status: "hot" | "working" | "follow_up" | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
}

export interface PersonalTmaSettings {
  user_id: string;
  tma_id: string;
  status: "A" | "B" | "C" | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
}

export const personalSettingsService = {
  /**
   * Get personal settings for multiple contacts (for the current user)
   */
  async getContactSettings(contactIds: string[]): Promise<Record<string, PersonalContactSettings>> {
    if (contactIds.length === 0) return {};
    
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_contact_settings")
      .select("*")
      .in("contact_id", contactIds);

    if (error) {
      console.error("Error fetching contact settings:", error);
      return {};
    }

    // Index by contact_id for easy lookup
    const settingsMap: Record<string, PersonalContactSettings> = {};
    for (const setting of data || []) {
      settingsMap[setting.contact_id] = setting;
    }
    return settingsMap;
  },

  /**
   * Get personal settings for a single contact
   */
  async getContactSetting(contactId: string): Promise<PersonalContactSettings | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_contact_settings")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching contact setting:", error);
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
    const supabase = createClient();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("[Personal Settings] No user authenticated");
      return null;
    }

    console.log("[Personal Settings] Updating contact settings:", {
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
      console.error("[Personal Settings] Error updating contact settings:", {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }
    
    console.log("[Personal Settings] Successfully updated:", data);
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
    
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_tma_settings")
      .select("*")
      .in("tma_id", tmaIds);

    if (error) {
      console.error("Error fetching TMA settings:", error);
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
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_tma_settings")
      .select("*")
      .eq("tma_id", tmaId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching TMA setting:", error);
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
    const supabase = createClient();
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("[Personal Settings] No user authenticated");
      return null;
    }

    console.log("[Personal Settings] Updating TMA settings:", {
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
      console.error("[Personal Settings] Error updating TMA settings:", {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }
    
    console.log("[Personal Settings] Successfully updated:", data);
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
