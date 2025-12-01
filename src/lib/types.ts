/**
 * QERO CRM Type Definitions
 * Matches the Supabase schema for future integration
 */

import type { ContactStatus, CallOutcome, TmaStatus, TmaActivity } from "./utils/constants";

/**
 * Organization - Top-level entity
 */
export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

/**
 * Team - Industry vertical (Elektro, Holz, Gartenbau, etc.)
 */
export interface Team {
  id: string;
  organization_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

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
  status: ContactStatus | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  last_call: string | null; // ISO timestamp
  notes: string | null;
  team_id: string | null; // Which industry vertical this contact belongs to
  created_at: string; // ISO timestamp
}

export interface TmaCandidate {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  canton: string | null;
  status: TmaStatus | null; // Quality: A (Top), B (Ok), C (Flop)
  activity: TmaActivity | null; // Activity: active, inactive
  city: string | null;
  street: string | null;
  postal_code: string | null;
  position_title: string | null;
  notes: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  cv_url: string | null;
  references_url: string | null;
  short_profile_url: string | null;
  team_id: string | null; // Which industry vertical this candidate belongs to
  created_at: string;
  claimed_by: string | null;
  // Joined from profiles when fetched
  claimer?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
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
 * Contact Note - Individual note with author attribution
 */
export interface ContactNote {
  id: string;
  contact_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at?: string | null;
  // Joined from profiles
  author?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

/**
 * TMA Note - Individual note with author attribution for TMA candidates
 */
export interface TmaNote {
  id: string;
  tma_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at?: string | null;
  // Joined from profiles
  author?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
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
  page?: number;
  pageSize?: number;
}

export interface TmaFilters {
  status?: TmaStatus;
  canton?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Paginated contacts result
 */
export interface PaginatedContacts {
  data: Contact[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

