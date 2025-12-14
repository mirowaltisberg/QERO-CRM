import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// GET: URL-based sync
// ?bulk=1&page=N - bulk sync (100 inbox per page)
// ?trigger=1 - normal sync
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  if (searchParams.get("bulk") === "1") {
    const page = parseInt(searchParams.get("page") || "1", 10);
    const result = await bulkSync(page);
    return respondSuccess(result);
  }
  
  if (searchParams.get("trigger") === "1") {
    const result = await performSync();
    const redirect = new URL("/email", request.url);
    if (result.error) redirect.searchParams.set("syncError", result.error);
    return NextResponse.redirect(redirect);
  }
  
  return respondError("Use ?trigger=1 or ?bulk=1&page=N", 405);
}

export async function POST() {
  const result = await performSync();
  if (result.error) return respondError(result.error, 500);
  return respondSuccess(result);
}

interface GraphMessage {
  id: string;
  conversationId: string;
  internetMessageId?: string; // RFC 2822 Message-ID - same for sent and received copies
  subject: string | null;
  bodyPreview: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  bccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  isRead?: boolean;
  hasAttachments?: boolean;
  receivedDateTime: string | null;
  sentDateTime: string | null;
}

// Normal sync: 50 newest inbox + 50 newest sent
async function performSync() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const adminSupabase = createAdminClient();
    const { data: account } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .single();

    if (!account) return { error: "No email account connected" };
    const emailAccount = account as EmailAccount;

    const accessToken = await ensureValidToken(emailAccount);

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

    await adminSupabase
      .from("email_accounts")
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq("id", emailAccount.id);

    return { synced: true, newMessages: created };
  } catch (err) {
    console.error("[Sync] Error:", err);
    return { error: err instanceof Error ? err.message : "Sync failed" };
  }
}

// Bulk sync with FULL body content
async function bulkSync(page: number) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const adminSupabase = createAdminClient();
    const { data: account } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .single();

    if (!account) return { error: "No email account connected" };
    const emailAccount = account as EmailAccount;

    console.log(`[BulkSync] Page ${page}`);

    const accessToken = await ensureValidToken(emailAccount);

    const skip = (page - 1) * 100;
    const messages = await fetchMessagesWithBody(accessToken, "inbox", 100, skip);
    console.log(`[BulkSync] Page ${page}: ${messages.length} messages`);

    if (messages.length === 0) {
      return { page, processed: 0, hasMore: false, message: "No more emails" };
    }

    let created = 0;
    for (const msg of messages) {
      const r = await upsertMessage(adminSupabase, emailAccount, msg, "inbox");
      if (r.messageCreated) created++;
    }

    const hasMore = messages.length === 100;
    return { 
      page, 
      processed: messages.length, 
      created, 
      hasMore,
      nextUrl: hasMore ? `/api/email/sync?bulk=1&page=${page + 1}` : null
    };
  } catch (err) {
    console.error("[BulkSync] Error:", err);
    return { error: err instanceof Error ? err.message : "Bulk sync failed" };
  }
}

// Fetch with body preview only (faster for regular sync)
async function fetchMessages(accessToken: string, folder: string, limit: number): Promise<GraphMessage[]> {
  const url = `${GRAPH_BASE_URL}/me/mailFolders/${folder}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,isRead,hasAttachments,receivedDateTime,sentDateTime`;
  
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.value || [];
  } catch {
    return [];
  }
}

// Fetch with FULL body content
async function fetchMessagesWithBody(accessToken: string, folder: string, limit: number, skip: number): Promise<GraphMessage[]> {
  // Include body in the select
  const url = `${GRAPH_BASE_URL}/me/mailFolders/${folder}/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,isRead,hasAttachments,receivedDateTime,sentDateTime`;
  
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30000), // Longer timeout for full body
    });
    if (!res.ok) {
      console.error(`[Fetch] ${folder} error:`, res.status);
      return [];
    }
    const data = await res.json();
    return data.value || [];
  } catch (err) {
    console.error(`[Fetch] ${folder} error:`, err);
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
    .select("id, participants, last_message_at, has_attachments")
    .eq("account_id", emailAccount.id)
    .eq("graph_conversation_id", msg.conversationId)
    .single();

  let threadId: string;

  if (existingThread) {
    threadId = existingThread.id;
  } else {
    const participants = buildParticipants(emailAccount.mailbox, msg, folder);

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
    // UPDATE existing message (folder/recipients/ids + body if available)
    const updates: Record<string, unknown> = {
      folder,
      internet_message_id: msg.internetMessageId || null,
      sender_email: msg.from?.emailAddress?.address || emailAccount.mailbox,
      sender_name: msg.from?.emailAddress?.name || emailAccount.mailbox.split("@")[0],
      recipients: mapEmails(msg.toRecipients),
      cc: mapEmails(msg.ccRecipients) || [],
      bcc: mapEmails(msg.bccRecipients) || [],
      subject: msg.subject || "(No subject)",
      body_preview: msg.bodyPreview?.slice(0, 200) || "",
      is_read: msg.isRead ?? false,
      has_attachments: msg.hasAttachments ?? false,
      received_at: msg.receivedDateTime,
      sent_at: msg.sentDateTime,
    };
    if (msg.body?.content) {
      updates.body_html = msg.body.contentType === "html" ? msg.body.content : null;
      updates.body_text = msg.body.contentType === "text" ? msg.body.content : null;
    }

    await adminSupabase.from("email_messages").update(updates).eq("id", existingMsg.id);

    // Keep thread metadata fresh (best-effort)
    await refreshThreadFromMessage(
      adminSupabase,
      existingThread?.id || threadId,
      existingThread?.participants || [],
      existingThread?.last_message_at || null,
      existingThread?.has_attachments ?? false,
      emailAccount.mailbox,
      msg,
      folder
    );
    return { threadCreated: !existingThread, messageCreated: false };
  }

  // Create new message with FULL body
  const { error } = await adminSupabase
    .from("email_messages")
    .insert({
      thread_id: threadId,
      graph_message_id: msg.id,
      internet_message_id: msg.internetMessageId || null,
      sender_email: msg.from?.emailAddress?.address || emailAccount.mailbox,
      sender_name: msg.from?.emailAddress?.name || emailAccount.mailbox.split("@")[0],
      recipients: mapEmails(msg.toRecipients),
      cc: mapEmails(msg.ccRecipients) || [],
      bcc: mapEmails(msg.bccRecipients) || [],
      subject: msg.subject || "(No subject)",
      body_preview: msg.bodyPreview?.slice(0, 200) || "",
      body_html: msg.body?.contentType === "html" ? msg.body.content : null,
      body_text: msg.body?.contentType === "text" ? msg.body.content : null,
      is_read: msg.isRead ?? false,
      has_attachments: msg.hasAttachments ?? false,
      received_at: msg.receivedDateTime,
      sent_at: msg.sentDateTime,
      folder,
    });

  // Keep thread metadata fresh (best-effort)
  await refreshThreadFromMessage(
    adminSupabase,
    threadId,
    existingThread?.participants || [],
    existingThread?.last_message_at || null,
    existingThread?.has_attachments ?? false,
    emailAccount.mailbox,
    msg,
    folder
  );

  return { threadCreated: !existingThread, messageCreated: !error };
}

function mapEmails(recipients?: Array<{ emailAddress?: { address?: string } }>): string[] {
  if (!recipients || recipients.length === 0) return [];
  return recipients
    .map((r) => r.emailAddress?.address)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

function normalizeParticipant(p: string): string {
  const m = p.match(/<([^>]+)>/);
  return (m?.[1] || p).trim().toLowerCase();
}

function buildParticipants(mailbox: string, msg: GraphMessage, folder: "inbox" | "sent"): string[] {
  const out: string[] = [];

  if (msg.from?.emailAddress?.address) {
    const addr = msg.from.emailAddress.address;
    const name = msg.from.emailAddress.name;
    out.push(name ? `${name} <${addr}>` : addr);
  } else if (folder === "sent") {
    out.push(mailbox);
  }

  // To + CC are the main participants
  [...(msg.toRecipients || []), ...(msg.ccRecipients || [])].forEach((r) => {
    const addr = r.emailAddress?.address;
    const name = r.emailAddress?.name;
    if (addr) out.push(name ? `${name} <${addr}>` : addr);
  });

  // Dedup by normalized email
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = normalizeParticipant(p);
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function refreshThreadFromMessage(
  adminSupabase: ReturnType<typeof createAdminClient>,
  threadId: string,
  existingParticipants: string[],
  existingLastMessageAt: string | null,
  existingHasAttachments: boolean,
  mailbox: string,
  msg: GraphMessage,
  folder: "inbox" | "sent"
) {
  const messageAt = msg.receivedDateTime || msg.sentDateTime;
  const newParts = buildParticipants(mailbox, msg, folder);
  const mergedParticipants = mergeParticipants(existingParticipants || [], newParts);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    participants: mergedParticipants,
  };

  // Never clear has_attachments once true
  if (existingHasAttachments || msg.hasAttachments) {
    updates.has_attachments = true;
  }

  // Only update "latest" thread fields if this message is >= current last_message_at
  const shouldUpdateLatest =
    !!messageAt &&
    (!existingLastMessageAt || new Date(messageAt).getTime() >= new Date(existingLastMessageAt).getTime());

  if (shouldUpdateLatest) {
    updates.last_message_at = messageAt;
    if (msg.subject) updates.subject = msg.subject;
    if (typeof msg.bodyPreview === "string") updates.snippet = msg.bodyPreview.slice(0, 200);
  }

  await adminSupabase.from("email_threads").update(updates).eq("id", threadId);
}

function mergeParticipants(existing: string[], incoming: string[]): string[] {
  const bestByEmail = new Map<string, string>();

  const add = (p: string) => {
    const key = normalizeParticipant(p);
    if (!key) return;
    const current = bestByEmail.get(key);
    // Prefer "Name <email>" over bare email
    if (!current) {
      bestByEmail.set(key, p);
      return;
    }
    const currentHasName = /</.test(current);
    const nextHasName = /</.test(p);
    if (!currentHasName && nextHasName) {
      bestByEmail.set(key, p);
    }
  };

  existing.forEach(add);
  incoming.forEach(add);

  return Array.from(bestByEmail.values());
}
