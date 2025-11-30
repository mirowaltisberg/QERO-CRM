/**
 * Server-side Data Service Layer
 * Uses Supabase Server Client for server components
 */

import type { Contact, ContactFilters } from "../types";
import { createClient } from "../supabase/server";

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
   */
  async getAll(filters?: ContactFilters): Promise<Contact[]> {
    const supabase = await createClient();
    
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
};
