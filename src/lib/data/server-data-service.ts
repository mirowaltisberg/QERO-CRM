/**
 * Server-side Data Service Layer
 * Uses Supabase Server Client for server components
 */

import type { Contact, ContactFilters } from "../types";
import { createClient } from "../supabase/server";

/**
 * Server-side Contact Operations
 * Use this in server components (pages, layouts)
 */
export const serverContactService = {
  /**
   * Get all contacts (up to 10k) - for server components
   */
  async getAll(filters?: ContactFilters): Promise<Contact[]> {
    const supabase = await createClient();
    
    // Fetch all contacts with explicit high limit
    let query = supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10000); // Allow up to 10k contacts

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
      console.error("Error fetching contacts:", error);
      return [];
    }

    return data || [];
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
};

