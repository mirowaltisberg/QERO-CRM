/**
 * POST /api/contacts/outlook/sync
 * 
 * Sync Outlook contacts from Microsoft Graph into Supabase.
 * 
 * Two modes:
 * 1. **Legacy mode** (no body): Uses delta queries for incremental sync from all contacts
 * 2. **Folder mode** (with folders in body): Imports from specific folders with specialization tagging
 * 
 * - Skips duplicates based on phone, email domain, and name
 * - Only inserts new contacts, never updates CRM fields
 * - May update specialization on existing contacts if it's currently NULL
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";
import { geocodeByPostalOrCity } from "@/lib/geo";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// Public email domains to ignore for domain-based deduplication
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.ch",
  "hotmail.com", "hotmail.ch", "yahoo.com", "yahoo.ch",
  "icloud.com", "me.com", "mac.com", "gmx.ch", "gmx.net", "gmx.de",
  "bluewin.ch", "sunrise.ch", "hispeed.ch", "protonmail.com",
  "proton.me", "aol.com", "live.com", "msn.com",
]);

// Request body for folder-based sync
interface FolderSyncRequest {
  folders: Array<{
    folderId: string;
    specialization: string | null;
  }>;
}

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
  personalNotes: string | null;
}

interface GraphContactsResponse {
  value: GraphContact[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

interface SyncResult {
  imported: number;
  skipped: number;
  updated: number; // For specialization updates on existing contacts
  errors: string[];
  duplicateReasons: {
    phone: number;
    email_domain: number;
    name: number;
    already_imported: number;
  };
}

/**
 * Fetch contacts from a specific folder (non-delta)
 */
async function fetchContactsFromFolder(
  accessToken: string,
  folderId: string
): Promise<GraphContact[]> {
  const contacts: GraphContact[] = [];
  let url: string | null = `${GRAPH_BASE_URL}/me/contactFolders/${folderId}/contacts?$select=id,displayName,givenName,surname,companyName,emailAddresses,businessPhones,mobilePhone,homePhones,businessAddress,homeAddress,personalNotes&$top=200`;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Outlook Sync] Graph API error fetching folder contacts:", response.status, errorText);
      throw new Error(`Failed to fetch contacts from folder: ${response.status}`);
    }

    const data: GraphContactsResponse = await response.json();
    contacts.push(...data.value);

    url = data["@odata.nextLink"] || null;

    // Safety limit
    if (contacts.length > 5000) {
      console.warn("[Outlook Sync] Reached 5000 contacts limit for folder");
      break;
    }
  }

  return contacts;
}

/**
 * Fetch contacts from Microsoft Graph with delta support (legacy mode)
 */
async function fetchContactsDelta(
  accessToken: string,
  deltaToken: string | null
): Promise<{ contacts: GraphContact[]; nextDeltaToken: string }> {
  const contacts: GraphContact[] = [];
  let url: string;
  
  if (deltaToken) {
    url = deltaToken;
  } else {
    url = `${GRAPH_BASE_URL}/me/contacts/delta?$select=id,displayName,givenName,surname,companyName,emailAddresses,businessPhones,mobilePhone,homePhones,businessAddress,homeAddress,personalNotes`;
  }

  let nextDeltaToken = "";

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Outlook Sync] Graph API error:", response.status, errorText);
      
      let errorMessage = `Failed to fetch contacts from Graph API: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) errorMessage += ` - ${errorJson.error.message}`;
        if (errorJson.error?.code) errorMessage += ` (Code: ${errorJson.error.code})`;
      } catch {
        if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`;
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

    if (contacts.length > 5000) {
      console.warn("[Outlook Sync] Reached 5000 contacts limit");
      break;
    }
  }

  return { contacts, nextDeltaToken };
}

function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  return email.split("@")[1]?.toLowerCase() || null;
}

function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = name.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.length >= 2 ? normalized : null;
}

function mapGraphContactToPayload(
  contact: GraphContact,
  teamId: string | null,
  sourceAccountId: string,
  specialization: string | null
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
  specialization: string | null;
  source: string;
  source_account_id: string;
  source_graph_contact_id: string;
  notes: string | null;
} | null {
  let companyName = contact.companyName;
  const email = contact.emailAddresses?.[0]?.address || null;
  
  if (!companyName && email) {
    const domain = extractEmailDomain(email);
    if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
      const domainParts = domain.split(".");
      companyName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
    }
  }
  
  if (!companyName) return null;

  const contactName = contact.displayName || 
    [contact.givenName, contact.surname].filter(Boolean).join(" ") || 
    "Unbekannt";

  const phone = contact.mobilePhone || contact.businessPhones?.[0] || contact.homePhones?.[0] || null;
  const address = contact.businessAddress || contact.homeAddress;
  const street = address?.street || null;
  const city = address?.city || null;
  const postalCode = address?.postalCode || null;

  let latitude: number | null = null;
  let longitude: number | null = null;
  
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
    canton: null,
    latitude,
    longitude,
    team_id: teamId,
    specialization,
    source: "outlook",
    source_account_id: sourceAccountId,
    source_graph_contact_id: contact.id,
    notes: contact.personalNotes || null,
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

    // Parse request body (optional)
    let folderRequest: FolderSyncRequest | null = null;
    try {
      const body = await request.json();
      if (body && Array.isArray(body.folders) && body.folders.length > 0) {
        folderRequest = body as FolderSyncRequest;
      }
    } catch {
      // No body or invalid JSON - use legacy mode
    }

    const isFolderMode = folderRequest !== null;
    console.log("[Outlook Sync] Mode:", isFolderMode ? "Folder" : "Legacy (Delta)");

    // Get user's email account
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

    // Ensure valid tokens
    let accessToken: string;
    try {
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

    // Fetch contacts based on mode
    const graphContactsWithSpec: Array<{ contact: GraphContact; specialization: string | null }> = [];
    let nextDeltaToken = "";

    if (isFolderMode && folderRequest) {
      // Folder mode: fetch from each specified folder
      for (const folder of folderRequest.folders) {
        console.log(`[Outlook Sync] Fetching folder ${folder.folderId} with spec: ${folder.specialization}`);
        const folderContacts = await fetchContactsFromFolder(accessToken, folder.folderId);
        console.log(`[Outlook Sync] Got ${folderContacts.length} contacts from folder`);
        
        for (const contact of folderContacts) {
          graphContactsWithSpec.push({ contact, specialization: folder.specialization });
        }
      }
    } else {
      // Legacy mode: delta query
      const { contacts, nextDeltaToken: token } = await fetchContactsDelta(
        accessToken,
        emailAccount.contacts_delta_token
      );
      nextDeltaToken = token;
      
      for (const contact of contacts) {
        graphContactsWithSpec.push({ contact, specialization: null });
      }
    }

    console.log("[Outlook Sync] Fetched", graphContactsWithSpec.length, "contacts total");

    // Load existing contacts for deduplication
    let existingContactsQuery = adminClient
      .from("contacts")
      .select("id, normalized_phone_digits, normalized_name, email_domain, source_graph_contact_id, specialization, notes");

    if (teamId) {
      existingContactsQuery = existingContactsQuery.eq("team_id", teamId);
    }

    const { data: existingContacts, error: existingError } = await existingContactsQuery;

    if (existingError) {
      console.error("[Outlook Sync] Error fetching existing contacts:", existingError);
      return respondError("Failed to check for duplicates", 500);
    }

    // Build lookup sets
    const existingPhones = new Set<string>();
    const existingNames = new Set<string>();
    const existingDomains = new Set<string>();
    const existingGraphIds = new Map<string, { id: string; specialization: string | null; notes: string | null }>();

    for (const contact of existingContacts || []) {
      if (contact.normalized_phone_digits) existingPhones.add(contact.normalized_phone_digits);
      if (contact.normalized_name) existingNames.add(contact.normalized_name);
      if (contact.email_domain && !PUBLIC_EMAIL_DOMAINS.has(contact.email_domain)) {
        existingDomains.add(contact.email_domain);
      }
      if (contact.source_graph_contact_id) {
        existingGraphIds.set(contact.source_graph_contact_id, {
          id: contact.id,
          specialization: contact.specialization,
          notes: contact.notes,
        });
      }
    }

    // Process contacts
    const result: SyncResult = {
      imported: 0,
      skipped: 0,
      updated: 0,
      errors: [],
      duplicateReasons: {
        phone: 0,
        email_domain: 0,
        name: 0,
        already_imported: 0,
      },
    };

    const contactsToInsert: ReturnType<typeof mapGraphContactToPayload>[] = [];
    const contactsToUpdateFields: Array<{ id: string; updates: Record<string, any> }> = [];

    for (const { contact: graphContact, specialization } of graphContactsWithSpec) {
      // Check if already imported
      const existing = existingGraphIds.get(graphContact.id);
      if (existing) {
        // Already exists - check if we need to update any fields
        const updates: Record<string, any> = {};

        // Update specialization if not set
        if (specialization && !existing.specialization) {
          updates.specialization = specialization;
        }

        // Update notes if not set and Outlook has notes
        if (!existing.notes && graphContact.personalNotes?.trim()) {
          updates.notes = graphContact.personalNotes.trim();
        }

        if (Object.keys(updates).length > 0) {
          contactsToUpdateFields.push({ id: existing.id, updates });
        }

        result.skipped++;
        result.duplicateReasons.already_imported++;
        continue;
      }

      // Map to CRM payload
      const payload = mapGraphContactToPayload(graphContact, teamId, emailAccount.id, specialization);
      if (!payload) {
        result.skipped++;
        continue;
      }

      // Check for duplicates
      const normalizedPhone = normalizePhoneDigits(payload.phone);
      const normalizedName = normalizeName(payload.company_name);
      const emailDomain = extractEmailDomain(payload.email);

      if (normalizedPhone && existingPhones.has(normalizedPhone)) {
        result.skipped++;
        result.duplicateReasons.phone++;
        continue;
      }

      if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain) && existingDomains.has(emailDomain)) {
        result.skipped++;
        result.duplicateReasons.email_domain++;
        continue;
      }

      if (normalizedName && existingNames.has(normalizedName)) {
        result.skipped++;
        result.duplicateReasons.name++;
        continue;
      }

      // Add to insert list
      contactsToInsert.push(payload);
      if (normalizedPhone) existingPhones.add(normalizedPhone);
      if (normalizedName) existingNames.add(normalizedName);
      if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain)) existingDomains.add(emailDomain);
      existingGraphIds.set(graphContact.id, { id: "", specialization: null, notes: null }); // Mark as seen
    }

    console.log("[Outlook Sync] Contacts to insert:", contactsToInsert.length);
    console.log("[Outlook Sync] Contacts to update fields:", contactsToUpdateFields.length);

    // Batch insert new contacts
    if (contactsToInsert.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
        const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await adminClient.from("contacts").insert(batch);

        if (insertError) {
          console.error("[Outlook Sync] Batch insert error:", insertError);
          result.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`);
        } else {
          result.imported += batch.length;
        }
      }
    }

    // Batch update fields for existing contacts
    if (contactsToUpdateFields.length > 0) {
      for (const update of contactsToUpdateFields) {
        const { error: updateError } = await adminClient
          .from("contacts")
          .update(update.updates)
          .eq("id", update.id);

        if (updateError) {
          console.error("[Outlook Sync] Update error:", updateError);
          result.errors.push(`Update ${update.id}: ${updateError.message}`);
        } else {
          result.updated++;
        }
      }
    }

    // Update delta token (only in legacy mode)
    if (!isFolderMode && nextDeltaToken) {
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
    }

    console.log("[Outlook Sync] Complete:", result);

    return respondSuccess({
      imported: result.imported,
      skipped: result.skipped,
      updated: result.updated,
      errors: result.errors,
      duplicateReasons: result.duplicateReasons,
      totalFromGraph: graphContactsWithSpec.length,
    });
  } catch (error) {
    console.error("[Outlook Sync] Unexpected error:", error);
    return respondError(
      error instanceof Error ? error.message : "Sync failed",
      500
    );
  }
}
