/**
 * POST /api/admin/contacts/outlook/sync-all
 * 
 * Admin-only endpoint to sync Outlook contacts for ALL connected users.
 * Iterates through all email_accounts and syncs contacts into each user's team.
 * 
 * Restricted to admin emails: m.waltisberg@qero.ch, shtanaj@qero.ch
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";
import { isCleanupAllowed } from "@/lib/utils/cleanup-auth";
import { geocodeByPostalOrCity } from "@/lib/geo";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// Public email domains to ignore for domain-based deduplication
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

interface UserSyncResult {
  userId: string;
  mailbox: string;
  teamId: string | null;
  imported: number;
  skipped: number;
  error: string | null;
}

/**
 * Fetch contacts from Microsoft Graph with delta support
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
    // Initial sync - get all contacts
    // Note: Delta queries don't support $select, $top, $filter, etc.
    // All fields are returned by default
    url = `${GRAPH_BASE_URL}/me/contacts/delta`;
  }

  let nextDeltaToken = "";

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Graph API error: ${response.status} - ${error}`);
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
      console.warn("[Admin Outlook Sync] Reached 5000 contacts limit");
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
  let companyName = contact.companyName;
  const email = contact.emailAddresses?.[0]?.address || null;
  
  if (!companyName && email) {
    const domain = extractEmailDomain(email);
    if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
      const domainParts = domain.split(".");
      companyName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
    }
  }
  
  if (!companyName) {
    return null;
  }

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

/**
 * Sync contacts for a single user/account
 */
async function syncUserContacts(
  adminClient: ReturnType<typeof createAdminClient>,
  account: {
    id: string;
    user_id: string;
    mailbox: string;
    access_token: string;
    refresh_token: string;
    token_expires_at: string;
    contacts_delta_token: string | null;
  },
  teamId: string | null
): Promise<UserSyncResult> {
  const result: UserSyncResult = {
    userId: account.user_id,
    mailbox: account.mailbox,
    teamId,
    imported: 0,
    skipped: 0,
    error: null,
  };

  try {
    // Ensure valid token - adapt to EmailAccount interface
    const emailAccountAdapter = {
      ...account,
      delta_token: account.contacts_delta_token, // EmailAccount expects delta_token
    };
    const accessToken = await ensureValidToken(emailAccountAdapter as EmailAccount);

    // Fetch contacts
    const { contacts: graphContacts, nextDeltaToken } = await fetchContactsDelta(
      accessToken,
      account.contacts_delta_token
    );

    // Load existing contacts for this team
    let existingQuery = adminClient
      .from("contacts")
      .select("id, normalized_phone_digits, normalized_name, email_domain, source_graph_contact_id");

    if (teamId) {
      existingQuery = existingQuery.eq("team_id", teamId);
    }

    const { data: existingContacts } = await existingQuery;

    // Build lookup sets
    const existingPhones = new Set<string>();
    const existingNames = new Set<string>();
    const existingDomains = new Set<string>();
    const existingGraphIds = new Set<string>();

    for (const contact of existingContacts || []) {
      if (contact.normalized_phone_digits) existingPhones.add(contact.normalized_phone_digits);
      if (contact.normalized_name) existingNames.add(contact.normalized_name);
      if (contact.email_domain && !PUBLIC_EMAIL_DOMAINS.has(contact.email_domain)) {
        existingDomains.add(contact.email_domain);
      }
      if (contact.source_graph_contact_id) existingGraphIds.add(contact.source_graph_contact_id);
    }

    // Process contacts
    const contactsToInsert: ReturnType<typeof mapGraphContactToPayload>[] = [];

    for (const graphContact of graphContacts) {
      if (existingGraphIds.has(graphContact.id)) {
        result.skipped++;
        continue;
      }

      const payload = mapGraphContactToPayload(graphContact, teamId, account.id);
      if (!payload) {
        result.skipped++;
        continue;
      }

      const normalizedPhone = normalizePhoneDigits(payload.phone);
      const normalizedName = normalizeName(payload.company_name);
      const emailDomain = extractEmailDomain(payload.email);

      if (normalizedPhone && existingPhones.has(normalizedPhone)) {
        result.skipped++;
        continue;
      }

      if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain) && existingDomains.has(emailDomain)) {
        result.skipped++;
        continue;
      }

      if (normalizedName && existingNames.has(normalizedName)) {
        result.skipped++;
        continue;
      }

      contactsToInsert.push(payload);
      if (normalizedPhone) existingPhones.add(normalizedPhone);
      if (normalizedName) existingNames.add(normalizedName);
      if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain)) existingDomains.add(emailDomain);
      existingGraphIds.add(graphContact.id);
    }

    // Batch insert
    if (contactsToInsert.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
        const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await adminClient.from("contacts").insert(batch);

        if (insertError) {
          console.error(`[Admin Sync] Batch error for ${account.mailbox}:`, insertError);
        } else {
          result.imported += batch.length;
        }
      }
    }

    // Update delta token
    await adminClient
      .from("email_accounts")
      .update({
        contacts_delta_token: nextDeltaToken,
        contacts_last_sync_at: new Date().toISOString(),
        contacts_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Admin Sync] Error for ${account.mailbox}:`, error);

    // Store error in account
    await adminClient
      .from("email_accounts")
      .update({
        contacts_sync_error: result.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);
  }

  return result;
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

    // Get user's email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    const userEmail = profile?.email || user.email;

    // Check admin authorization
    if (!isCleanupAllowed(userEmail)) {
      return respondError("Admin access required", 403);
    }

    console.log("[Admin Outlook Sync] Starting bulk sync by:", userEmail);

    // Get all email accounts with their user's team_id
    const { data: accounts, error: accountsError } = await adminClient
      .from("email_accounts")
      .select(`
        id,
        user_id,
        mailbox,
        access_token,
        refresh_token,
        token_expires_at,
        contacts_delta_token
      `);

    if (accountsError || !accounts) {
      console.error("[Admin Outlook Sync] Failed to fetch accounts:", accountsError);
      return respondError("Failed to fetch connected accounts", 500);
    }

    console.log("[Admin Outlook Sync] Found", accounts.length, "connected accounts");

    // Get team_ids for all users
    const userIds = accounts.map(a => a.user_id);
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, team_id")
      .in("id", userIds);

    const teamIdMap = new Map<string, string | null>();
    for (const p of profiles || []) {
      teamIdMap.set(p.id, p.team_id);
    }

    // Sync each account
    const results: UserSyncResult[] = [];
    
    for (const account of accounts) {
      const teamId = teamIdMap.get(account.user_id) || null;
      console.log(`[Admin Outlook Sync] Syncing ${account.mailbox} (team: ${teamId})`);
      
      const result = await syncUserContacts(adminClient, account, teamId);
      results.push(result);
      
      // Small delay between accounts to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summarize results
    const summary = {
      totalAccounts: accounts.length,
      totalImported: results.reduce((sum, r) => sum + r.imported, 0),
      totalSkipped: results.reduce((sum, r) => sum + r.skipped, 0),
      accountsWithErrors: results.filter(r => r.error).length,
      details: results.map(r => ({
        mailbox: r.mailbox,
        teamId: r.teamId,
        imported: r.imported,
        skipped: r.skipped,
        error: r.error,
      })),
    };

    console.log("[Admin Outlook Sync] Complete:", summary);

    return respondSuccess(summary);
  } catch (error) {
    console.error("[Admin Outlook Sync] Unexpected error:", error);
    return respondError(
      error instanceof Error ? error.message : "Sync failed",
      500
    );
  }
}

