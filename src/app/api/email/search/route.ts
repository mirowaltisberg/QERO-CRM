import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// GET /api/email/search?q=... - Search emails via Microsoft Graph
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const folder = searchParams.get("folder") || "inbox";

    if (!query || query.length < 2) {
      return respondSuccess({ results: [], source: "none" });
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

    // Search Microsoft Graph directly
    const folderPath = folder === "sent" ? "sentitems" : folder;
    const searchUrl = `${GRAPH_BASE_URL}/me/mailFolders/${folderPath}/messages?$search="${encodeURIComponent(query)}"&$top=50&$select=id,conversationId,subject,bodyPreview,from,toRecipients,isRead,hasAttachments,receivedDateTime,sentDateTime`;

    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ConsistencyLevel: "eventual",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Search] Graph API error:", response.status, errorText);
      return respondError("Search failed", 500);
    }

    const data = await response.json();
    const messages = data.value || [];

    // Transform to thread-like format for the UI
    const results = messages.map((msg: {
      id: string;
      conversationId: string;
      subject: string | null;
      bodyPreview: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      isRead?: boolean;
      hasAttachments?: boolean;
      receivedDateTime: string | null;
    }) => ({
      id: msg.id,
      graph_message_id: msg.id,
      graph_conversation_id: msg.conversationId,
      subject: msg.subject || "(No subject)",
      snippet: msg.bodyPreview?.slice(0, 200) || "",
      participants: msg.from?.emailAddress?.address
        ? [msg.from.emailAddress.name 
            ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
            : msg.from.emailAddress.address]
        : [],
      is_read: msg.isRead ?? true,
      has_attachments: msg.hasAttachments ?? false,
      last_message_at: msg.receivedDateTime,
      is_starred: false,
      folder,
      is_live_result: true,
    }));

    return respondSuccess({
      results,
      source: "graph",
      query,
    });
  } catch (err) {
    console.error("[Search] Unexpected error:", err);
    return respondError("Search failed", 500);
  }
}
