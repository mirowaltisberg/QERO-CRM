import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const CRON_SECRET = process.env.CRON_SECRET;

// Optimized limits for speed
const MESSAGES_PER_FOLDER = 25;

interface GraphMessage {
  id: string;
  conversationId: string;
  internetMessageId?: string; // RFC 2822 Message-ID - same for sent and received copies
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
export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    return respondError("CRON_SECRET not configured", 500);
  }

  // Check auth - Vercel header or query param
  const authHeader = request.headers.get("authorization");
  const headerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const querySecret = new URL(request.url).searchParams.get("secret");

  if (headerSecret !== CRON_SECRET && querySecret !== CRON_SECRET) {
    return respondError("Unauthorized", 401);
  }

  const startTime = Date.now();

  try {
    const adminSupabase = createAdminClient();

    const { data: accounts } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("provider", "outlook");

    if (!accounts || accounts.length === 0) {
      return respondSuccess({ message: "No accounts", duration: Date.now() - startTime });
    }

    const results: Array<{ mailbox: string; newMessages: number; error?: string }> = [];

    for (const account of accounts) {
      const emailAccount = account as EmailAccount;
      
      try {
        const accessToken = await ensureValidToken(emailAccount);

        // Fetch inbox and sent in PARALLEL
        const [inboxMessages, sentMessages] = await Promise.all([
          fetchMessages(accessToken, "inbox", MESSAGES_PER_FOLDER),
          fetchMessages(accessToken, "sentitems", MESSAGES_PER_FOLDER),
        ]);

        const allMessages = [
          ...inboxMessages.map(m => ({ ...m, _folder: "inbox" as const })),
          ...sentMessages.map(m => ({ ...m, _folder: "sent" as const })),
        ];

        if (allMessages.length === 0) {
          results.push({ mailbox: emailAccount.mailbox, newMessages: 0 });
          continue;
        }

        // BATCH check existing messages (single query)
        const messageIds = allMessages.map(m => m.id);
        const { data: existingMessages } = await adminSupabase
          .from("email_messages")
          .select("graph_message_id")
          .in("graph_message_id", messageIds);

        const existingIds = new Set(existingMessages?.map(m => m.graph_message_id) || []);
        const newMessages = allMessages.filter(m => !existingIds.has(m.id));

        // Only process NEW messages (skip existing)
        let created = 0;
        for (const msg of newMessages) {
          const wasCreated = await upsertMessage(adminSupabase, emailAccount, msg, msg._folder);
          if (wasCreated) created++;
        }

        // Update last sync
        await adminSupabase
          .from("email_accounts")
          .update({ last_sync_at: new Date().toISOString(), sync_error: null })
          .eq("id", emailAccount.id);

        results.push({ mailbox: emailAccount.mailbox, newMessages: created });

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error";
        await adminSupabase
          .from("email_accounts")
          .update({ sync_error: errorMsg })
          .eq("id", emailAccount.id);
        results.push({ mailbox: emailAccount.mailbox, newMessages: 0, error: errorMsg });
      }
    }

    return respondSuccess({
      synced: accounts.length,
      results,
      duration: Date.now() - startTime,
    });
  } catch (err) {
    return respondError(err instanceof Error ? err.message : "Failed", 500);
  }
}

async function fetchMessages(accessToken: string, folder: string, limit: number): Promise<GraphMessage[]> {
  // Only fetch essential fields (no body - too slow)
  const url = `${GRAPH_BASE_URL}/me/mailFolders/${folder}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,conversationId,internetMessageId,subject,bodyPreview,from,toRecipients,isRead,hasAttachments,receivedDateTime,sentDateTime`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.value || [];
  } catch {
    return [];
  }
}

async function upsertMessage(
  adminSupabase: ReturnType<typeof createAdminClient>,
  emailAccount: EmailAccount,
  msg: GraphMessage & { _folder: "inbox" | "sent" },
  folder: "inbox" | "sent"
): Promise<boolean> {
  // Find or create thread
  const { data: existingThread } = await adminSupabase
    .from("email_threads")
    .select("id")
    .eq("account_id", emailAccount.id)
    .eq("graph_conversation_id", msg.conversationId)
    .single();

  let threadId: string;

  if (existingThread) {
    threadId = existingThread.id;
    // Update thread's last_message_at if this message is newer
    await adminSupabase
      .from("email_threads")
      .update({ 
        last_message_at: msg.receivedDateTime || msg.sentDateTime,
        snippet: msg.bodyPreview?.slice(0, 200) || "",
      })
      .eq("id", threadId)
      .lt("last_message_at", msg.receivedDateTime || msg.sentDateTime || "1970-01-01");
  } else {
    const participants: string[] = [];
    if (msg.from?.emailAddress?.address) {
      const addr = msg.from.emailAddress.address;
      const name = msg.from.emailAddress.name;
      participants.push(name ? `${name} <${addr}>` : addr);
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

    if (error) return false;
    threadId = newThread.id;
  }

  // Check if message already exists by graph_message_id
  const { data: existingMsg } = await adminSupabase
    .from("email_messages")
    .select("id")
    .eq("graph_message_id", msg.id)
    .single();

  if (existingMsg) return false; // Already exists

  // Also check by internet_message_id to avoid sent/received duplicates
  if (msg.internetMessageId) {
    const { data: duplicateMsg } = await adminSupabase
      .from("email_messages")
      .select("id")
      .eq("internet_message_id", msg.internetMessageId)
      .single();

    if (duplicateMsg) return false; // Duplicate (sent/received copy)
  }

  // Insert message (body will be fetched on-demand when user opens it)
  const { error } = await adminSupabase
    .from("email_messages")
    .insert({
      thread_id: threadId,
      graph_message_id: msg.id,
      internet_message_id: msg.internetMessageId || null,
      sender_email: msg.from?.emailAddress?.address || emailAccount.mailbox,
      sender_name: msg.from?.emailAddress?.name || emailAccount.mailbox.split("@")[0],
      recipients: msg.toRecipients?.map((r) => r.emailAddress?.address).filter(Boolean) || [],
      cc: [],
      bcc: [],
      subject: msg.subject || "(No subject)",
      body_preview: msg.bodyPreview?.slice(0, 200) || "",
      body_html: null, // Fetched on-demand
      body_text: null, // Fetched on-demand
      is_read: msg.isRead ?? false,
      has_attachments: msg.hasAttachments ?? false,
      received_at: msg.receivedDateTime,
      sent_at: msg.sentDateTime,
    });

  return !error;
}
