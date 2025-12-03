import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// Cron secret for authentication (set in Vercel env vars)
const CRON_SECRET = process.env.CRON_SECRET;

interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string | null;
  bodyPreview: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  isRead?: boolean;
  hasAttachments?: boolean;
  receivedDateTime: string | null;
  sentDateTime: string | null;
}

// GET /api/cron/email-sync
// Called by Vercel Cron (uses Authorization header) or external service (uses ?secret=xxx)
export async function GET(request: NextRequest) {
  // Verify cron secret - check both Vercel header and query param
  if (!CRON_SECRET) {
    console.error("[Cron Sync] CRON_SECRET not configured");
    return respondError("Cron not configured", 500);
  }

  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  const headerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  
  // External cron sends: ?secret=xxx
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");

  if (headerSecret !== CRON_SECRET && querySecret !== CRON_SECRET) {
    console.error("[Cron Sync] Invalid secret");
    return respondError("Unauthorized", 401);
  }

  try {
    const adminSupabase = createAdminClient();

    // Get ALL email accounts (sync for all users)
    const { data: accounts, error: accountsError } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("provider", "outlook");

    if (accountsError) {
      console.error("[Cron Sync] Failed to fetch accounts:", accountsError);
      return respondError("Failed to fetch accounts", 500);
    }

    if (!accounts || accounts.length === 0) {
      return respondSuccess({ message: "No email accounts to sync", synced: 0 });
    }

    console.log(`[Cron Sync] Syncing ${accounts.length} account(s)`);

    const results: Array<{ mailbox: string; newMessages: number; error?: string }> = [];

    for (const account of accounts) {
      const emailAccount = account as EmailAccount;
      try {
        const accessToken = await ensureValidToken(emailAccount);

        // Fetch 50 newest from inbox and sent
        const inboxMessages = await fetchMessages(accessToken, "inbox", 50);
        const sentMessages = await fetchMessages(accessToken, "sentitems", 50);

        let created = 0;
        for (const msg of inboxMessages) {
          const r = await upsertMessage(adminSupabase, emailAccount, msg, "inbox");
          if (r.messageCreated) created++;
        }
        for (const msg of sentMessages) {
          const r = await upsertMessage(adminSupabase, emailAccount, msg, "sent");
          if (r.messageCreated) created++;
        }

        // Update last sync time
        await adminSupabase
          .from("email_accounts")
          .update({ last_sync_at: new Date().toISOString(), sync_error: null })
          .eq("id", emailAccount.id);

        results.push({ mailbox: emailAccount.mailbox, newMessages: created });
        console.log(`[Cron Sync] ${emailAccount.mailbox}: ${created} new messages`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Cron Sync] Error for ${emailAccount.mailbox}:`, err);

        // Store error in account
        await adminSupabase
          .from("email_accounts")
          .update({ sync_error: errorMsg })
          .eq("id", emailAccount.id);

        results.push({ mailbox: emailAccount.mailbox, newMessages: 0, error: errorMsg });
      }
    }

    return respondSuccess({
      message: `Synced ${accounts.length} account(s)`,
      results,
    });
  } catch (err) {
    console.error("[Cron Sync] Unexpected error:", err);
    return respondError(err instanceof Error ? err.message : "Sync failed", 500);
  }
}

async function fetchMessages(accessToken: string, folder: string, limit: number): Promise<GraphMessage[]> {
  const url = `${GRAPH_BASE_URL}/me/mailFolders/${folder}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,isRead,hasAttachments,receivedDateTime,sentDateTime`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.error(`[Cron Sync] Fetch ${folder} failed:`, res.status);
      return [];
    }
    const data = await res.json();
    return data.value || [];
  } catch (err) {
    console.error(`[Cron Sync] Fetch ${folder} error:`, err);
    return [];
  }
}

async function upsertMessage(
  adminSupabase: ReturnType<typeof createAdminClient>,
  emailAccount: EmailAccount,
  msg: GraphMessage,
  folder: "inbox" | "sent"
): Promise<{ threadCreated: boolean; messageCreated: boolean }> {
  // Check/create thread
  const { data: existingThread } = await adminSupabase
    .from("email_threads")
    .select("id")
    .eq("account_id", emailAccount.id)
    .eq("graph_conversation_id", msg.conversationId)
    .single();

  let threadId: string;

  if (existingThread) {
    threadId = existingThread.id;
  } else {
    const participants: string[] = [];
    if (msg.from?.emailAddress?.address) {
      const addr = msg.from.emailAddress.address;
      const name = msg.from.emailAddress.name;
      participants.push(name ? `${name} <${addr}>` : addr);
    } else if (folder === "sent") {
      participants.push(emailAccount.mailbox);
    }
    msg.toRecipients?.forEach((r) => {
      const addr = r.emailAddress?.address;
      const name = r.emailAddress?.name;
      if (addr) participants.push(name ? `${name} <${addr}>` : addr);
    });

    const { data: newThread, error } = await adminSupabase
      .from("email_threads")
      .insert({
        account_id: emailAccount.id,
        graph_conversation_id: msg.conversationId,
        subject: msg.subject || "(No subject)",
        snippet: msg.bodyPreview?.slice(0, 200) || "",
        folder,
        participants,
        is_read: msg.isRead ?? false,
        has_attachments: msg.hasAttachments ?? false,
        last_message_at: msg.receivedDateTime || msg.sentDateTime,
      })
      .select("id")
      .single();

    if (error) return { threadCreated: false, messageCreated: false };
    threadId = newThread.id;
  }

  // Check if message exists
  const { data: existingMsg } = await adminSupabase
    .from("email_messages")
    .select("id")
    .eq("graph_message_id", msg.id)
    .single();

  if (existingMsg) {
    // Update existing message with full body if we have it now
    if (msg.body?.content) {
      await adminSupabase
        .from("email_messages")
        .update({
          body_html: msg.body.contentType === "html" ? msg.body.content : null,
          body_text: msg.body.contentType === "text" ? msg.body.content : null,
        })
        .eq("id", existingMsg.id);
    }
    return { threadCreated: !existingThread, messageCreated: false };
  }

  // Create new message with full body
  const { error } = await adminSupabase
    .from("email_messages")
    .insert({
      thread_id: threadId,
      graph_message_id: msg.id,
      sender_email: msg.from?.emailAddress?.address || emailAccount.mailbox,
      sender_name: msg.from?.emailAddress?.name || emailAccount.mailbox.split("@")[0],
      recipients: msg.toRecipients?.map((r) => r.emailAddress?.address).filter(Boolean) || [],
      cc: [],
      bcc: [],
      subject: msg.subject || "(No subject)",
      body_preview: msg.bodyPreview?.slice(0, 200) || "",
      body_html: msg.body?.contentType === "html" ? msg.body.content : null,
      body_text: msg.body?.contentType === "text" ? msg.body.content : null,
      is_read: msg.isRead ?? false,
      has_attachments: msg.hasAttachments ?? false,
      received_at: msg.receivedDateTime,
      sent_at: msg.sentDateTime,
    });

  return { threadCreated: !existingThread, messageCreated: !error };
}
