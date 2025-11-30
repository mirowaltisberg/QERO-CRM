/**
 * QERO CRM Type Definitions
 * Matches the Supabase schema for future integration
 */

import type { ContactStatus, CallOutcome } from "./utils/constants";

/**
 * Contact - A person/company to call
 */
export interface Contact {
  id: string;
  company_name: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  canton: string | null;
  status: ContactStatus;
  last_call: string | null; // ISO timestamp
  notes: string | null;
  created_at: string; // ISO timestamp
}

/**
 * Call Log - Record of a call made to a contact
 */
export interface CallLog {
  id: string;
  contact_id: string;
  outcome: CallOutcome;
  notes: string | null;
  timestamp: string; // ISO timestamp
}

/**
 * List - A named collection of contacts
 */
export interface List {
  id: string;
  name: string;
  description: string | null;
  created_at: string; // ISO timestamp
}

/**
 * List Member - Junction table linking contacts to lists
 */
export interface ListMember {
  id: string;
  list_id: string;
  contact_id: string;
}

/**
 * Contact with lists info (table view convenience)
 */
export interface ContactWithLists extends Contact {
  list_ids?: string[];
}

/**
 * API Response types
 */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Filter options for contacts
 */
export interface ContactFilters {
  status?: ContactStatus;
  canton?: string;
  search?: string;
  list_id?: string;
}

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  callsToday: number;
  callsThisWeek: number;
  followUpsDue: number;
  conversionRate: number;
  topLists: Array<{
    id: string;
    name: string;
    contactCount: number;
    callCount: number;
  }>;
  callTrend: Array<{
    date: string;
    count: number;
  }>;
  followUps: Contact[];
}

