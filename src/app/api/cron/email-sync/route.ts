import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const CRON_SECRET = process.env.CRON_SECRET;

// Reduced limits to fit in Vercel timeout
const MESSAGES_PER_FOLDER = 20; // Reduced from 50

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

async function handleSync(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (!CRON_SECRET) {
    return respondError("CRON_SECRET not configured", 500);
  }

  if (secret !== CRON_SECRET) {
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

    let totalCreated = 0;

    for (const account of accounts) {
      const emailAccount = account as EmailAccount;
      
      try {
        const accessToken = await ensureValidToken(emailAccount);

        // Fetch in parallel
        const [inboxMessages, sentMessages] = await Promise.all([
          fetchMessages(accessToken, "inbox", MESSAGES_PER_FOLDER),
          fetchMessages(accessToken, "sentitems", MESSAGES_PER_FOLDER),
        ]);

        // Process messages
        const allMessages = [
          ...inboxMessages.map(m => ({ ...m, _folder: "inbox" as const })),
          ...sentMessages.map(m => ({ ...m, _folder: "sent" as const })),
        ];

        // Batch check existing messages
        const messageIds = allMessages.map(m => m.id);
        const { data: existingMessages } = await adminSupabase
          .from("email_messages")
          .select("graph_message_id")
          .in("graph_message_id", messageIds);

        const existingIds = new Set(existingMessages?.map(m => m.graph_message_id) || []);
        const newMessages = allMessages.filter(m => !existingIds.has(m.id));

        // Only process new messages
        for (const msg of newMessages) {
          const created = await upsertMessage(adminSupabase, emailAccount, msg, msg._folder);
          if (created) totalCreated++;
        }

        await adminSupabase
          .from("email_accounts")
          .update({ last_sync_at: new Date().toISOString(), sync_error: null })
          .eq("id", emailAccount.id);

      } catch (err) {
        console.error(`[Cron] ${emailAccount.mailbox} error:`, err);
        await adminSupabase
          .from("email_accounts")
          .update({ sync_error: err instanceof Error ? err.message : "Error" })
          .eq("id", emailAccount.id);
      }
    }

    return respondSuccess({
      synced: accounts.length,
      newMessages: totalCreated,
      duration: Date.now() - startTime,
    });
  } catch (err) {
    return respondError(err instanceof Error ? err.message : "Failed", 500);
  }
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}

async function fetchMessages(accessToken: string, folder: string, limit: number): Promise<GraphMessage[]> {
  const url = `${GRAPH_BASE_URL}/me/mailFolders/${folder}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,isRead,hasAttachments,receivedDateTime,sentDateTime`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000), // 8 second timeout
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

    if (error) return false;
    threadId = newThread.id;
  }

  // Insert message
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

  return !error;
}
