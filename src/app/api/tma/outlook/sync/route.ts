import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";
import { geocodeByPostalOrCity } from "@/lib/geo";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface SelectedFolder {
  folderId: string;
  specialization: string | null;
}

interface GraphContact {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  emailAddresses?: Array<{ address: string }>;
  businessPhones?: string[];
  mobilePhone?: string;
  homePhones?: string[];
  businessAddress?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    countryOrRegion?: string;
  };
  homeAddress?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    countryOrRegion?: string;
  };
  jobTitle?: string;
}

interface GraphContactsResponse {
  value: GraphContact[];
  "@odata.nextLink"?: string;
}

/**
 * POST /api/tma/outlook/sync
 * 
 * Imports TMA candidates from selected Outlook contact folders.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Get request body
    const body = await request.json().catch(() => ({}));
    const folders: SelectedFolder[] | null = body.folders;

    if (!folders || folders.length === 0) {
      return respondError("No folders selected", 400);
    }

    // Get user's profile for team_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();

    const teamId = profile?.team_id || null;

    // Get email account with tokens
    const { data: emailAccount, error: accountError } = await adminClient
      .from("email_accounts")
      .select("id, user_id, mailbox, access_token, refresh_token, token_expires_at")
      .eq("user_id", user.id)
      .single();

    if (accountError || !emailAccount) {
      console.error("[TMA Outlook Sync] No email account found:", accountError);
      return respondError(
        "No Outlook account connected. Please connect your Outlook account in Settings.",
        400
      );
    }

    // Ensure we have a valid access token
    let accessToken: string;
    try {
      accessToken = await ensureValidToken(emailAccount as EmailAccount);
    } catch (tokenError) {
      console.error("[TMA Outlook Sync] Token refresh failed:", tokenError);
      return respondError(
        "Outlook connection expired. Please reconnect your account in Settings.",
        401
      );
    }

    let imported = 0;
    let skipped = 0;
    let totalFromGraph = 0;
    const errors: string[] = [];

    // Process each selected folder
    for (const folder of folders) {
      console.log(`[TMA Outlook Sync] Processing folder ${folder.folderId} with specialization ${folder.specialization}`);

      // Fetch contacts from this folder
      let url = `${GRAPH_BASE_URL}/me/contactFolders/${folder.folderId}/contacts?$top=999`;
      
      while (url) {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[TMA Outlook Sync] Graph API error:", errorText);
          errors.push(`Folder ${folder.folderId}: ${response.status}`);
          break;
        }

        const data: GraphContactsResponse = await response.json();
        totalFromGraph += data.value.length;

        // Process each contact
        for (const graphContact of data.value) {
          try {
            const result = await processGraphContactAsTma(
              graphContact,
              folder.specialization,
              teamId,
              user.id,
              adminClient
            );
            
            if (result === "imported") {
              imported++;
            } else {
              skipped++;
            }
          } catch (err) {
            console.error("[TMA Outlook Sync] Error processing contact:", err);
            errors.push(`Contact ${graphContact.displayName}: ${err instanceof Error ? err.message : "Unknown error"}`);
          }
        }

        url = data["@odata.nextLink"] || "";
      }
    }

    console.log(`[TMA Outlook Sync] Complete. Imported: ${imported}, Skipped: ${skipped}, Total from Graph: ${totalFromGraph}`);

    return respondSuccess({
      imported,
      skipped,
      totalFromGraph,
      errors: errors.slice(0, 10), // Limit error messages
    });
  } catch (error) {
    console.error("[TMA Outlook Sync] Unexpected error:", error);
    return respondError(
      error instanceof Error ? error.message : "Failed to sync TMA from Outlook",
      500
    );
  }
}

async function processGraphContactAsTma(
  graphContact: GraphContact,
  specialization: string | null,
  teamId: string | null,
  userId: string,
  adminClient: ReturnType<typeof createAdminClient>
): Promise<"imported" | "skipped"> {
  // Extract first and last name
  const firstName = graphContact.givenName?.trim() || "";
  const lastName = graphContact.surname?.trim() || "";

  // Skip if no name
  if (!firstName && !lastName) {
    console.log("[TMA Outlook Sync] Skipping contact without name:", graphContact.displayName);
    return "skipped";
  }

  // Use displayName parts if givenName/surname not available
  let finalFirstName = firstName;
  let finalLastName = lastName;
  
  if (!finalFirstName && !finalLastName && graphContact.displayName) {
    const parts = graphContact.displayName.trim().split(/\s+/);
    finalFirstName = parts[0] || "";
    finalLastName = parts.slice(1).join(" ") || "";
  }

  if (!finalFirstName) {
    return "skipped";
  }

  // Check for existing TMA by name (case-insensitive)
  const { data: existing } = await adminClient
    .from("tma_candidates")
    .select("id, specialization")
    .ilike("first_name", finalFirstName)
    .ilike("last_name", finalLastName || "")
    .limit(1);

  if (existing && existing.length > 0) {
    // Update specialization if not set
    if (!existing[0].specialization && specialization) {
      await adminClient
        .from("tma_candidates")
        .update({ specialization })
        .eq("id", existing[0].id);
      console.log(`[TMA Outlook Sync] Updated specialization for ${finalFirstName} ${finalLastName}`);
    }
    return "skipped";
  }

  // Extract contact details
  const email = graphContact.emailAddresses?.[0]?.address || null;
  const phone = graphContact.mobilePhone || 
                graphContact.businessPhones?.[0] || 
                graphContact.homePhones?.[0] || 
                null;

  // Get address (prefer business, fallback to home)
  const address = graphContact.businessAddress || graphContact.homeAddress;
  const city = address?.city || null;
  const street = address?.street || null;
  const postalCode = address?.postalCode || null;
  const canton = address?.state || null;

  // Geocode if we have location info
  const coords = geocodeByPostalOrCity(postalCode, city);

  // Insert new TMA candidate
  const { error: insertError } = await adminClient
    .from("tma_candidates")
    .insert({
      first_name: finalFirstName,
      last_name: finalLastName || "",
      email,
      phone,
      city,
      street,
      postal_code: postalCode,
      canton,
      position_title: graphContact.jobTitle || null,
      team_id: teamId,
      specialization,
      latitude: coords?.lat || null,
      longitude: coords?.lng || null,
      is_new: true,
      source_graph_contact_id: graphContact.id,
    });

  if (insertError) {
    console.error("[TMA Outlook Sync] Insert error:", insertError);
    throw new Error(insertError.message);
  }

  console.log(`[TMA Outlook Sync] Imported: ${finalFirstName} ${finalLastName}`);
  return "imported";
}

