import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/email/message/[id] - Fetch single message from Microsoft Graph
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: graphMessageId } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const adminSupabase = createAdminClient();
    const { data: account } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .single();

    if (!account) {
      return respondError("No email account connected", 404);
    }

    const emailAccount = account as EmailAccount;

    // Get access token
    let accessToken: string;
    try {
      accessToken = await ensureValidToken(emailAccount);
    } catch {
      return respondError("Failed to authenticate with Microsoft", 401);
    }

    // Fetch full message from Graph API
    const messageUrl = `${GRAPH_BASE_URL}/me/messages/${graphMessageId}?$select=id,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,isRead,hasAttachments,receivedDateTime,sentDateTime`;

    const response = await fetch(messageUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Message API] Graph error:", response.status, errorText);
      return respondError("Failed to fetch message", response.status);
    }

    const message = await response.json();

    return respondSuccess(message);
  } catch (err) {
    console.error("[Message API] Error:", err);
    return respondError("Failed to fetch message", 500);
  }
}

