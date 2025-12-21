/**
 * Deduplication utilities for Outlook contact sync
 * 
 * Implements loose duplicate detection:
 * - Same phone (digits-only) → skip
 * - Same email domain (unless public domain) → skip
 * - Same name (normalized) → skip
 */

// Public email domains that are too common for domain-based deduplication
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.ch",
  "hotmail.com",
  "hotmail.ch",
  "yahoo.com",
  "yahoo.ch",
  "icloud.com",
  "me.com",
  "mac.com",
  "gmx.ch",
  "gmx.net",
  "gmx.de",
  "bluewin.ch",
  "sunrise.ch",
  "hispeed.ch",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "live.com",
  "msn.com",
]);

/**
 * Normalize phone number for comparison (digits only)
 * Returns null if phone has fewer than 6 digits
 */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  // Must have at least 6 digits to be considered valid
  return digits.length >= 6 ? digits : null;
}

/**
 * Extract email domain (lowercase)
 * Returns null if email doesn't contain @
 */
export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  return domain || null;
}

/**
 * Normalize name for comparison (lowercase, trimmed, collapsed whitespace)
 * Returns null if name is less than 2 characters after normalization
 */
export function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = name.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.length >= 2 ? normalized : null;
}

/**
 * Check if an email domain is a public/consumer email domain
 * These are excluded from domain-based deduplication
 */
export function isPublicEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export interface DedupeCheckResult {
  isDuplicate: boolean;
  reason: "phone" | "email_domain" | "name" | "graph_id" | null;
}

/**
 * Check if a contact would be considered a duplicate based on the lookup sets
 */
export function checkDuplicate(
  contact: {
    phone: string | null;
    email: string | null;
    company_name: string;
    source_graph_contact_id: string;
  },
  existingPhones: Set<string>,
  existingNames: Set<string>,
  existingDomains: Set<string>,
  existingGraphIds: Set<string>
): DedupeCheckResult {
  // Already imported from this Graph contact
  if (existingGraphIds.has(contact.source_graph_contact_id)) {
    return { isDuplicate: true, reason: "graph_id" };
  }

  // Same phone → skip
  const normalizedPhone = normalizePhoneDigits(contact.phone);
  if (normalizedPhone && existingPhones.has(normalizedPhone)) {
    return { isDuplicate: true, reason: "phone" };
  }

  // Same email domain → skip (unless public domain)
  const emailDomain = extractEmailDomain(contact.email);
  if (emailDomain && !isPublicEmailDomain(emailDomain) && existingDomains.has(emailDomain)) {
    return { isDuplicate: true, reason: "email_domain" };
  }

  // Same name → skip
  const normalizedName = normalizeName(contact.company_name);
  if (normalizedName && existingNames.has(normalizedName)) {
    return { isDuplicate: true, reason: "name" };
  }

  return { isDuplicate: false, reason: null };
}

