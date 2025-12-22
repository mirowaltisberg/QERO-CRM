/**
 * QERO CRM Type Definitions
 * Matches the Supabase schema for future integration
 */

import type { ContactStatus, CallOutcome, TmaStatus, TmaActivity, DrivingLicense, ExperienceLevel } from "./utils/constants";

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
  city: string | null;
  street: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ContactStatus | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  last_call: string | null; // ISO timestamp
  notes: string | null;
  team_id: string | null; // Which industry vertical this contact belongs to
  created_at: string; // ISO timestamp
  // Computed distance (only present in radius search results)
  distance_km?: number;
  // Joined team info
  team?: {
    id: string;
    name: string;
    color: string;
  } | null;
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
  gender: "male" | "female" | null;
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
  quality_note: string | null; // Note explaining the quality rating
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
  photo_url: string | null; // Profile photo for Kurzprofil
  // Personal documents for contracts
  ahv_url: string | null;
  id_url: string | null;
  bank_url: string | null;
  team_id: string | null; // Which industry vertical this candidate belongs to
  created_at: string;
  claimed_by: string | null;
  // Coordinates for location search
  latitude: number | null;
  longitude: number | null;
  // Driving license
  driving_license: DrivingLicense | null;
  // Experience level
  experience_level: ExperienceLevel | null;
  // NEW flag - shows "NEW" badge until someone adds a note
  is_new: boolean;
  // Computed distance (only present in radius search results)
  distance_km?: number;
  // Joined from profiles when fetched
  claimer?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  // Address edit tracking
  address_updated_by: string | null;
  address_updated_at: string | null;
  address_updated_by_profile?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  // Team info (for filtering in candidate mode)
  team?: {
    id: string;
    name: string;
    color: string;
  } | null;
}

export interface TmaRole {
  id: string;
  team_id: string;
  name: string;
  color: string;
  note: string | null;
  created_at: string;
  // Joined team info (for cross-team views)
  team?: {
    id: string;
    name: string;
    color: string;
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
  teamId?: string | "all" | null; // Filter by team: specific UUID, "all", or null (default to user's team)
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
  for_candidate_id?: string | null;
  // Joined from profiles
  caller?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  // Joined from tma_candidates (when call was made for a specific candidate)
  for_candidate?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

// Chat types
export interface ChatRoom {
  id: string;
  type: "all" | "team" | "dm";
  name: string | null;
  team_id: string | null;
  created_at: string;
  unread_count?: number;
  has_mention?: boolean;
  last_message?: {
    id: string;
    content: string;
    created_at: string;
    sender?: { full_name: string };
  } | null;
  dm_user?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    team_id: string | null;
    team?: { name: string; color: string } | null;
  } | null;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  mentions: string[];
  created_at: string;
  updated_at: string;
  sender: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    team_id: string | null;
    team?: { name: string; color: string } | null;
  };
  attachments: ChatAttachment[];
}

export interface ChatAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
}

export interface ChatMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  team_id: string | null;
  team?: { id: string; name: string; color: string } | null;
}

// ============================================
// VAKANZEN (VACANCIES) TYPES
// ============================================

export type VacancyStatus = "open" | "interviewing" | "filled";
export type VacancyCandidateStatus = "suggested" | "contacted" | "interviewing" | "rejected" | "hired";
export type VacancyUrgency = 1 | 2 | 3;

/**
 * Vacancy - A job opening posted by a company
 */
export interface Vacancy {
  id: string;
  contact_id: string;
  contact?: Contact; // Joined company info
  title: string;
  role: string | null; // For TMA matching
  description: string | null;
  city: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_km: number;
  min_quality: "A" | "B" | "C" | null;
  urgency: VacancyUrgency; // 1 = Kann warten, 2 = Bald, 3 = Sofort
  driving_license: DrivingLicense | null; // Required driving license
  min_experience: ExperienceLevel | null; // Minimum experience required
  status: VacancyStatus;
  created_by: string;
  creator?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  created_at: string;
  updated_at: string;
  // Computed fields
  candidate_count?: number;
}

/**
 * VacancyCandidate - A TMA candidate matched/assigned to a vacancy
 */
export interface VacancyCandidate {
  id: string;
  vacancy_id: string;
  tma_id: string;
  tma?: TmaCandidate; // Joined candidate info
  status: VacancyCandidateStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields (from matching)
  distance_km?: number;
  match_score?: number;
}

/**
 * Filter options for vacancies
 */
export interface VacancyFilters {
  status?: VacancyStatus;
  role?: string;
  search?: string;
  contact_id?: string;
}

// ============================================
// WHATSAPP INTEGRATION TYPES
// ============================================

export type WhatsAppMessageDirection = "inbound" | "outbound";
export type WhatsAppMessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";
export type WhatsAppMessageType = "text" | "template" | "image" | "document" | "audio" | "video" | "sticker" | "location" | "contacts" | "interactive" | "reaction" | "unknown";

/**
 * WhatsApp Business Account configuration
 */
export interface WhatsAppAccount {
  id: string;
  name: string;
  waba_id: string;
  phone_number_id: string;
  phone_number: string;
  is_active: boolean;
  webhook_verify_token: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * WhatsApp Conversation - one per phone number + CRM entity
 */
export interface WhatsAppConversation {
  id: string;
  account_id: string;
  wa_id: string;
  phone_number: string;
  profile_name: string | null;
  linked_tma_id: string | null;
  linked_contact_id: string | null;
  assigned_to: string | null;
  is_unread: boolean;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_customer_message_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  linked_tma?: TmaCandidate | null;
  linked_contact?: Contact | null;
  assignee?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  messages?: WhatsAppMessage[];
}

/**
 * WhatsApp Message
 */
export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  wamid: string | null;
  direction: WhatsAppMessageDirection;
  message_type: WhatsAppMessageType;
  status: WhatsAppMessageStatus;
  body: string | null;
  template_name: string | null;
  template_params: Record<string, string> | null;
  sender_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  sender?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  media?: WhatsAppMedia[];
}

/**
 * WhatsApp Media attachment
 */
export interface WhatsAppMedia {
  id: string;
  message_id: string;
  wa_media_id: string | null;
  mime_type: string;
  file_name: string | null;
  file_size: number | null;
  sha256: string | null;
  storage_path: string | null;
  storage_url: string | null;
  caption: string | null;
  created_at: string;
}

/**
 * WhatsApp Opt-in record
 */
export interface WhatsAppOptIn {
  id: string;
  phone_number: string;
  wa_id: string;
  linked_tma_id: string | null;
  linked_contact_id: string | null;
  opted_in: boolean;
  opted_in_at: string | null;
  opted_out_at: string | null;
  consent_source: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Filter options for WhatsApp conversations
 */
export interface WhatsAppConversationFilters {
  linked_tma_id?: string;
  linked_contact_id?: string;
  assigned_to?: string;
  is_unread?: boolean;
  search?: string;
}
