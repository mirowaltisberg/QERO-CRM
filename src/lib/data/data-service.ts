/**
 * Data Service Layer
 * Uses Supabase for all data operations
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

// Default page size - can handle up to 10k+ with pagination
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

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
    
    // Fetch all contacts without pagination limit (Supabase default is 1000)
    // We need to explicitly set a higher limit
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
   * Get paginated contacts with filters
   */
  async getPaginated(filters?: ContactFilters): Promise<PaginatedContacts> {
    const supabase = createClient();
    
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;

    // Build the base query for counting
    let countQuery = supabase
      .from("contacts")
      .select("*", { count: "exact", head: true });

    // Build the data query
    let dataQuery = supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Apply filters to both queries
    if (filters?.status) {
      countQuery = countQuery.eq("status", filters.status);
      dataQuery = dataQuery.eq("status", filters.status);
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
      // First get contact IDs from list_members
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

    // Execute both queries in parallel
    const [countResult, dataResult] = await Promise.all([
      countQuery,
      dataQuery,
    ]);

    if (dataResult.error) {
      console.error("Error fetching contacts:", dataResult.error);
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }

    const total = countResult.count ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    return {
      data: dataResult.data || [],
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

    return data;
  },

  /**
   * Create a new contact
   */
  async create(data: Omit<Contact, "id" | "created_at">): Promise<Contact> {
    const supabase = createClient();
    
    const { data: newContact, error } = await supabase
      .from("contacts")
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error("Error creating contact:", error);
      throw new Error(error.message);
    }

    return newContact;
  },

  /**
   * Update a contact
   */
  async update(id: string, data: Partial<Contact>): Promise<Contact | null> {
    const supabase = createClient();
    
    const { data: updated, error } = await supabase
      .from("contacts")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating contact:", error);
      return null;
    }

    return updated;
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
   * Bulk update contacts
   */
  async bulkUpdate(
    ids: string[],
    data: Partial<Pick<Contact, "status" | "follow_up_at" | "follow_up_note">>
  ): Promise<number> {
    const supabase = createClient();
    let updated = 0;
    const payload: Partial<Contact> = { ...data };
    if (payload.status !== undefined && payload.status !== "follow_up") {
      payload.follow_up_at = null;
      payload.follow_up_note = null;
    }

    for (const id of ids) {
      const { error } = await supabase
        .from("contacts")
        .update(payload)
        .eq("id", id);

      if (!error) {
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
  /**
   * Get call logs for a contact
   */
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

  /**
   * Log a new call
   */
  async create(data: {
    contact_id: string;
    outcome: CallOutcome;
    notes?: string;
  }): Promise<CallLog> {
    const supabase = createClient();
    
    // Create the call log
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

  /**
   * Get all call logs (for dashboard stats)
   */
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
  /**
   * Get all lists
   */
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

  /**
   * Get a single list by ID
   */
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

  /**
   * Create a new list
   */
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

  /**
   * Add contacts to a list
   */
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

  /**
   * Remove contacts from a list
   */
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

  /**
   * Get contact count for a list
   */
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
 */
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
      console.error("Error fetching TMA candidates:", error);
      return [];
    }
    return data ?? [];
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
    return data;
  },

  async create(data: TmaCreateInput): Promise<TmaCandidate> {
    const supabase = createClient();
    const { data: created, error } = await supabase
      .from("tma_candidates")
      .insert(data)
      .select()
      .single();
    if (error) {
      console.error("Error creating TMA candidate:", error);
      throw new Error(error.message);
    }
    return created;
  },

  async update(id: string, data: Partial<TmaCandidate>): Promise<TmaCandidate | null> {
    const supabase = createClient();
    const { data: updated, error } = await supabase
      .from("tma_candidates")
      .update(data)
      .eq("id", id)
      .select(`
        *,
        claimer:profiles!claimed_by(id, full_name, avatar_url)
      `)
      .single();
    if (error) {
      console.error("Error updating TMA candidate:", error);
      return null;
    }
    return updated;
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
    await Promise.all(
      ids.map((id) =>
        this.update(id, {
          status,
          ...(status !== "C" ? { follow_up_at: null, follow_up_note: null } : {}),
        })
      )
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

    // Get all call logs
    const { data: allLogs } = await supabase
      .from("call_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    const logs = allLogs || [];

    // Calculate stats
    const callsToday = logs.filter(
      (log) => new Date(log.timestamp) >= todayStart
    ).length;

    const callsThisWeek = logs.filter(
      (log) => new Date(log.timestamp) >= weekStart
    ).length;

    const nowIso = new Date().toISOString();

    // Get follow-ups count (due now or overdue)
    const { count: followUpsDue } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("status", "follow_up")
      .or(`follow_up_at.is.null,follow_up_at.lte.${nowIso}`);

    // Conversion rate
    const successfulOutcomes = logs.filter(
      (log) => log.outcome === "interested" || log.outcome === "meeting_set"
    ).length;
    const conversionRate = logs.length > 0
      ? Math.round((successfulOutcomes / logs.length) * 100)
      : 0;

    // Get lists with counts
    const { data: lists } = await supabase
      .from("lists")
      .select("*");

    const topLists = await Promise.all(
      (lists || []).map(async (list) => {
        const contactCount = await listService.getContactCount(list.id);
        
        // Get contact IDs in list
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

    // Call trend data (last 14 days)
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

    // Get follow-up contacts
    const { data: followUps } = await supabase
      .from("contacts")
      .select("*")
      .eq("status", "follow_up")
      .order("follow_up_at", { ascending: true, nullsFirst: true })
      .limit(5);

    return {
      callsToday,
      callsThisWeek,
      followUpsDue: followUpsDue || 0,
      conversionRate,
      topLists: topLists.sort((a, b) => b.contactCount - a.contactCount),
      callTrend,
      followUps: followUps || [],
    };
  },
};
