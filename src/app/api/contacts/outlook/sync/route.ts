/**
 * POST /api/contacts/outlook/sync
 * 
 * Sync Outlook contacts from Microsoft Graph into Supabase.
 * - Uses delta queries for incremental sync
 * - Skips duplicates based on phone, email domain, and name
 * - Only inserts new contacts, never updates existing ones
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";
import { geocodeByPostalOrCity } from "@/lib/geo";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// Public email domains to ignore for domain-based deduplication
// (matching against these would skip too many contacts)
const PUBLIC_EMAIL_DOMAINS = new Set([
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

// Graph Contact interface
interface GraphContact {
  id: string;
  displayName: string | null;
  givenName: string | null;
  surname: string | null;
  companyName: string | null;
  emailAddresses: Array<{ address: string; name?: string }> | null;
  businessPhones: string[] | null;
  mobilePhone: string | null;
  homePhones: string[] | null;
  businessAddress: {
    street: string | null;
    city: string | null;
    postalCode: string | null;
    state: string | null;
    countryOrRegion: string | null;
  } | null;
  homeAddress: {
    street: string | null;
    city: string | null;
    postalCode: string | null;
    state: string | null;
    countryOrRegion: string | null;
  } | null;
}

interface GraphContactsResponse {
  value: GraphContact[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

interface SyncResult {
  imported: number;
  skipped: number;
  errors: string[];
  duplicateReasons: {
    phone: number;
    email_domain: number;
    name: number;
    already_imported: number;
  };
}

/**
 * Fetch contacts from Microsoft Graph with delta support
 */
async function fetchContactsDelta(
  accessToken: string,
  deltaToken: string | null
): Promise<{ contacts: GraphContact[]; nextDeltaToken: string }> {
  const contacts: GraphContact[] = [];

  // Build initial URL
  let url: string;
  if (deltaToken) {
    url = deltaToken;
  } else {
    // Initial sync - get all contacts
    url = `${GRAPH_BASE_URL}/me/contacts/delta?$select=id,displayName,givenName,surname,companyName,emailAddresses,businessPhones,mobilePhone,homePhones,businessAddress,homeAddress&$top=200`;
  }

  let nextDeltaToken = "";

  // Follow pagination
  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Outlook Sync] Graph API error response:");
      console.error("[Outlook Sync] Status:", response.status);
      console.error("[Outlook Sync] Status Text:", response.statusText);
      console.error("[Outlook Sync] Error body:", errorText);
      console.error("[Outlook Sync] Request URL:", url);
      
      let errorMessage = `Failed to fetch contacts from Graph API: ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage += ` - ${errorJson.error.message}`;
        }
        if (errorJson.error?.code) {
          errorMessage += ` (Code: ${errorJson.error.code})`;
        }
      } catch {
        // Not JSON, use raw text
        if (errorText) {
          errorMessage += ` - ${errorText.substring(0, 200)}`;
        }
      }
      
      throw new Error(errorMessage);
    }

    const data: GraphContactsResponse = await response.json();
    contacts.push(...data.value);

    if (data["@odata.nextLink"]) {
      url = data["@odata.nextLink"];
    } else if (data["@odata.deltaLink"]) {
      nextDeltaToken = data["@odata.deltaLink"];
      break;
    } else {
      break;
    }

    // Safety limit - process in batches if more than 5000
    if (contacts.length > 5000) {
      console.warn("[Outlook Sync] Reached 5000 contacts limit, stopping pagination");
      break;
    }
  }

  return { contacts, nextDeltaToken };
}

/**
 * Normalize phone number for comparison (digits only)
 */
function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  // Must have at least 6 digits to be considered valid
  return digits.length >= 6 ? digits : null;
}

/**
 * Extract email domain (lowercase)
 */
function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  return domain || null;
}

/**
 * Normalize name for comparison (lowercase, trimmed, collapsed whitespace)
 */
function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = name.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.length >= 2 ? normalized : null;
}

/**
 * Map Graph contact to CRM contact payload
 */
function mapGraphContactToPayload(
  contact: GraphContact,
  teamId: string | null,
  sourceAccountId: string
): {
  company_name: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  canton: string | null;
  latitude: number | null;
  longitude: number | null;
  team_id: string | null;
  source: string;
  source_account_id: string;
  source_graph_contact_id: string;
} | null {
  // Determine company name - use companyName if available, else derive from email domain
  let companyName = contact.companyName;
  const email = contact.emailAddresses?.[0]?.address || null;
  
  if (!companyName && email) {
    const domain = extractEmailDomain(email);
    if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
      // Use domain as company name (capitalize first letter)
      const domainParts = domain.split(".");
      companyName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
    }
  }
  
  // Skip if no company name
  if (!companyName) {
    return null;
  }

  // Determine contact name
  const contactName = contact.displayName || 
    [contact.givenName, contact.surname].filter(Boolean).join(" ") || 
    "Unbekannt";

  // Get phone - prefer mobile, then business
  const phone = contact.mobilePhone || contact.businessPhones?.[0] || contact.homePhones?.[0] || null;

  // Get address - prefer business
  const address = contact.businessAddress || contact.homeAddress;
  const street = address?.street || null;
  const city = address?.city || null;
  const postalCode = address?.postalCode || null;

  // Geocode if we have postal code or city
  let latitude: number | null = null;
  let longitude: number | null = null;
  const canton: string | null = null; // Canton not returned by geocodeByPostalOrCity
  
  if (postalCode || city) {
    const coords = geocodeByPostalOrCity(postalCode, city);
    if (coords) {
      latitude = coords.lat;
      longitude = coords.lng;
    }
  }

  return {
    company_name: companyName,
    contact_name: contactName,
    phone,
    email,
    street,
    city,
    postal_code: postalCode,
    canton,
    latitude,
    longitude,
    team_id: teamId,
    source: "outlook",
    source_account_id: sourceAccountId,
    source_graph_contact_id: contact.id,
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Get user's email account (Microsoft OAuth)
    const { data: emailAccount, error: accountError } = await adminClient
      .from("email_accounts")
      .select("id, user_id, mailbox, access_token, refresh_token, token_expires_at, contacts_delta_token")
      .eq("user_id", user.id)
      .single();

    if (accountError || !emailAccount) {
      console.error("[Outlook Sync] No email account found:", accountError);
      return respondError(
        "No Outlook account connected. Please connect your Outlook account in Settings.",
        400
      );
    }

    // Ensure we have valid tokens (refresh if needed)
    let accessToken: string;
    try {
      // Adapt to EmailAccount interface (which expects delta_token, not contacts_delta_token)
      const emailAccountAdapter = {
        ...emailAccount,
        delta_token: emailAccount.contacts_delta_token,
      };
      accessToken = await ensureValidToken(emailAccountAdapter as EmailAccount);
    } catch (tokenError) {
      console.error("[Outlook Sync] Token refresh failed:", tokenError);
      return respondError(
        "Outlook connection expired. Please reconnect your account in Settings.",
        401
      );
    }

    // Get user's team_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();

    const teamId = profile?.team_id || null;

    console.log("[Outlook Sync] Starting sync for user:", user.id, "team:", teamId);

    // Fetch contacts from Graph
    const { contacts: graphContacts, nextDeltaToken } = await fetchContactsDelta(
      accessToken,
      emailAccount.contacts_delta_token
    );

    console.log("[Outlook Sync] Fetched", graphContacts.length, "contacts from Graph");

    // Load existing contacts for deduplication
    // We need: normalized_phone_digits, normalized_name, email_domain, source_graph_contact_id
    let existingContactsQuery = adminClient
      .from("contacts")
      .select("id, normalized_phone_digits, normalized_name, email_domain, source_graph_contact_id");

    // Scope to team if user has one (prevents cross-team duplicates)
    if (teamId) {
      existingContactsQuery = existingContactsQuery.eq("team_id", teamId);
    }

    const { data: existingContacts, error: existingError } = await existingContactsQuery;

    if (existingError) {
      console.error("[Outlook Sync] Error fetching existing contacts:", existingError);
      return respondError("Failed to check for duplicates", 500);
    }

    // Build lookup sets for fast deduplication
    const existingPhones = new Set<string>();
    const existingNames = new Set<string>();
    const existingDomains = new Set<string>();
    const existingGraphIds = new Set<string>();

    for (const contact of existingContacts || []) {
      if (contact.normalized_phone_digits) {
        existingPhones.add(contact.normalized_phone_digits);
      }
      if (contact.normalized_name) {
        existingNames.add(contact.normalized_name);
      }
      if (contact.email_domain && !PUBLIC_EMAIL_DOMAINS.has(contact.email_domain)) {
        existingDomains.add(contact.email_domain);
      }
      if (contact.source_graph_contact_id) {
        existingGraphIds.add(contact.source_graph_contact_id);
      }
    }

    // Process contacts
    const result: SyncResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      duplicateReasons: {
        phone: 0,
        email_domain: 0,
        name: 0,
        already_imported: 0,
      },
    };

    const contactsToInsert: ReturnType<typeof mapGraphContactToPayload>[] = [];

    for (const graphContact of graphContacts) {
      // Skip if already imported from this Graph contact
      if (existingGraphIds.has(graphContact.id)) {
        result.skipped++;
        result.duplicateReasons.already_imported++;
        continue;
      }

      // Map to CRM payload
      const payload = mapGraphContactToPayload(graphContact, teamId, emailAccount.id);
      if (!payload) {
        // No valid company name
        result.skipped++;
        continue;
      }

      // Check for duplicates
      const normalizedPhone = normalizePhoneDigits(payload.phone);
      const normalizedName = normalizeName(payload.company_name);
      const emailDomain = extractEmailDomain(payload.email);

      // Same phone → skip
      if (normalizedPhone && existingPhones.has(normalizedPhone)) {
        result.skipped++;
        result.duplicateReasons.phone++;
        continue;
      }

      // Same email domain → skip (unless public domain)
      if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain) && existingDomains.has(emailDomain)) {
        result.skipped++;
        result.duplicateReasons.email_domain++;
        continue;
      }

      // Same name → skip
      if (normalizedName && existingNames.has(normalizedName)) {
        result.skipped++;
        result.duplicateReasons.name++;
        continue;
      }

      // Add to insert list and update lookup sets to prevent duplicates within this batch
      contactsToInsert.push(payload);
      if (normalizedPhone) existingPhones.add(normalizedPhone);
      if (normalizedName) existingNames.add(normalizedName);
      if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain)) existingDomains.add(emailDomain);
      existingGraphIds.add(graphContact.id);
    }

    console.log("[Outlook Sync] Contacts to insert:", contactsToInsert.length);

    // Batch insert contacts
    if (contactsToInsert.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
        const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await adminClient
          .from("contacts")
          .insert(batch);

        if (insertError) {
          console.error("[Outlook Sync] Batch insert error:", insertError);
          result.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`);
        } else {
          result.imported += batch.length;
        }
      }
    }

    // Update delta token for next sync
    const { error: updateError } = await adminClient
      .from("email_accounts")
      .update({
        contacts_delta_token: nextDeltaToken,
        contacts_last_sync_at: new Date().toISOString(),
        contacts_sync_error: result.errors.length > 0 ? result.errors.join("; ") : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emailAccount.id);

    if (updateError) {
      console.error("[Outlook Sync] Failed to update delta token:", updateError);
    }

    console.log("[Outlook Sync] Complete:", result);

    return respondSuccess({
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      duplicateReasons: result.duplicateReasons,
      totalFromGraph: graphContacts.length,
    });
  } catch (error) {
    console.error("[Outlook Sync] Unexpected error:", error);
    return respondError(
      error instanceof Error ? error.message : "Sync failed",
      500
    );
  }
}

