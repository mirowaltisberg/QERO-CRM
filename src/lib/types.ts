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

export interface ContactPerson {
  id: string;
  contact_id: string;
  first_name: string;
  last_name: string;
  role: string | null;
  mobile: string | null;
  direct_phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  updated_by_profile?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export interface TmaCandidate {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  canton: string | null;
  status: TmaStatus | null; // Quality: A (Top), B (Ok), C (Flop)
  status_tags: TmaStatus[]; // Multi-select A/B/C
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
  // Coordinates for location search
  latitude: number | null;
  longitude: number | null;
  // Computed distance (only present in radius search results)
  distance_km?: number;
  // Joined from profiles when fetched
  claimer?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export interface TmaRole {
  id: string;
  team_id: string;
  name: string;
  color: string;
  note: string | null;
  created_at: string;
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
  // Location-based search
  locationQuery?: string;
  radiusKm?: number;
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

// ============================================
// EMAIL INTEGRATION TYPES
// ============================================

export type EmailProvider = "outlook";

export interface EmailAccount {
  id: string;
  user_id: string;
  provider: EmailProvider;
  mailbox: string;
  token_expires_at: string | null;
  last_sync_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailFolder = "inbox" | "sent" | "drafts" | "archive" | "trash";

export interface EmailThread {
  id: string;
  account_id: string;
  graph_conversation_id: string;
  subject: string | null;
  snippet: string | null;
  folder: EmailFolder;
  participants: string[];
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  last_message_at: string | null;
  linked_contact_id: string | null;
  linked_tma_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  messages?: EmailMessage[];
  linked_contact?: Contact | null;
  linked_tma?: TmaCandidate | null;
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  graph_message_id: string;
  sender_email: string;
  sender_name: string | null;
  recipients: string[];
  cc: string[] | null;
  bcc: string[] | null;
  subject: string | null;
  body_preview: string | null;
  body_html: string | null;
  body_text: string | null;
  is_read: boolean;
  is_draft: boolean;
  has_attachments: boolean;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  // Joined data
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  id: string;
  message_id: string;
  graph_attachment_id: string;
  name: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  created_at: string;
}

export interface EmailFilters {
  folder?: EmailFolder;
  is_read?: boolean;
  is_starred?: boolean;
  search?: string;
  linked_contact_id?: string;
  linked_tma_id?: string;
}


/**
 * Contact Call Log - Record of when a contact was called and by whom
 */
export interface ContactCallLog {
  id: string;
  contact_id: string;
  user_id: string;
  called_at: string;
  created_at: string;
  // Joined from profiles
  caller?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}
