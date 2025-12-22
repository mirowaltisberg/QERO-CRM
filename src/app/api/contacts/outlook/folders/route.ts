/**
 * GET /api/contacts/outlook/folders
 * 
 * Lists all Outlook contact folders for the current user.
 * Used to let users pick which folder(s) to import from.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";
import { deriveSpecializationFromFolderName } from "@/lib/utils/outlook-specialization";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface GraphContactFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
}

interface GraphFoldersResponse {
  value: GraphContactFolder[];
  "@odata.nextLink"?: string;
}

export async function GET(request: NextRequest) {
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
      console.error("[Outlook Folders] No email account found:", accountError);
      return respondError(
        "No Outlook account connected. Please connect your Outlook account in Settings.",
        400
      );
    }

    // Ensure we have valid tokens (refresh if needed)
    let accessToken: string;
    try {
      const emailAccountAdapter = {
        ...emailAccount,
        delta_token: emailAccount.contacts_delta_token,
      };
      accessToken = await ensureValidToken(emailAccountAdapter as EmailAccount);
    } catch (tokenError) {
      console.error("[Outlook Folders] Token refresh failed:", tokenError);
      return respondError(
        "Outlook connection expired. Please reconnect your account in Settings.",
        401
      );
    }

    // Fetch contact folders from Graph
    const folders: GraphContactFolder[] = [];
    let url: string | null = `${GRAPH_BASE_URL}/me/contactFolders?$top=100`;

    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Outlook Folders] Graph API error:", response.status, errorText);
        return respondError(
          `Failed to fetch folders from Outlook: ${response.status}`,
          500
        );
      }

      const data: GraphFoldersResponse = await response.json();
      folders.push(...data.value);

      url = data["@odata.nextLink"] || null;
    }

    console.log(`[Outlook Folders] Found ${folders.length} contact folders for user ${user.id}`);

    // Map folders with suggested specialization
    const foldersWithSuggestion = folders.map(folder => ({
      id: folder.id,
      displayName: folder.displayName,
      parentFolderId: folder.parentFolderId || null,
      suggestedSpecialization: deriveSpecializationFromFolderName(folder.displayName),
    }));

    return respondSuccess({
      folders: foldersWithSuggestion,
      mailbox: emailAccount.mailbox,
    });
  } catch (error) {
    console.error("[Outlook Folders] Unexpected error:", error);
    return respondError(
      error instanceof Error ? error.message : "Failed to fetch folders",
      500
    );
  }
}

