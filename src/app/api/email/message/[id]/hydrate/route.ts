import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type GraphRecipient = { emailAddress?: { address?: string; name?: string } };

function mapAddresses(recipients?: GraphRecipient[]): string[] {
  if (!recipients || recipients.length === 0) return [];
  return recipients
    .map((r) => r.emailAddress?.address)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

// POST /api/email/message/[id]/hydrate - Fetch full message from Graph and persist missing fields in DB
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: graphMessageId } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Load account with tokens (admin client avoids any RLS surprises around token columns)
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
    const accessToken = await ensureValidToken(emailAccount);

    // Fetch full message from Graph
    const messageUrl =
      `${GRAPH_BASE_URL}/me/messages/${encodeURIComponent(graphMessageId)}` +
      `?$select=id,conversationId,internetMessageId,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,isRead,hasAttachments,receivedDateTime,sentDateTime`;

    const graphRes = await fetch(messageUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!graphRes.ok) {
      const errorText = await graphRes.text();
      console.error("[Hydrate] Graph error:", graphRes.status, errorText);
      return respondError("Failed to fetch message", graphRes.status);
    }

    const graphMsg = await graphRes.json();

    const updates: Record<string, unknown> = {
      internet_message_id: graphMsg.internetMessageId || null,
      sender_email: graphMsg.from?.emailAddress?.address || emailAccount.mailbox,
      sender_name: graphMsg.from?.emailAddress?.name || emailAccount.mailbox.split("@")[0],
      recipients: mapAddresses(graphMsg.toRecipients),
      cc: mapAddresses(graphMsg.ccRecipients),
      bcc: mapAddresses(graphMsg.bccRecipients),
      subject: graphMsg.subject || "(No subject)",
      body_preview: typeof graphMsg.bodyPreview === "string" ? graphMsg.bodyPreview.slice(0, 200) : "",
      body_html: graphMsg.body?.contentType?.toLowerCase?.() === "html" ? graphMsg.body.content : null,
      body_text: graphMsg.body?.contentType?.toLowerCase?.() === "text" ? graphMsg.body.content : null,
      is_read: graphMsg.isRead ?? true,
      has_attachments: graphMsg.hasAttachments ?? false,
      received_at: graphMsg.receivedDateTime || null,
      sent_at: graphMsg.sentDateTime || null,
    };

    // Persist into DB if this message exists in our tables (RLS-enforced update)
    const { data: existing } = await supabase
      .from("email_messages")
      .select("id")
      .eq("graph_message_id", graphMessageId)
      .maybeSingle();

    if (!existing) {
      // Not synced into DB yet (e.g. live search result). Still return hydrated data for UI use.
      return respondSuccess({ persisted: false, message: { graph_message_id: graphMessageId, ...updates } });
    }

    const { data: updated, error: updateError } = await supabase
      .from("email_messages")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError) {
      console.error("[Hydrate] DB update error:", updateError);
      return respondError("Failed to persist message", 500);
    }

    return respondSuccess({ persisted: true, message: updated });
  } catch (err) {
    console.error("[Hydrate] Unexpected error:", err);
    return respondError("Failed to hydrate message", 500);
  }
}


