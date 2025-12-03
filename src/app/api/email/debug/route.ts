import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const doSync = searchParams.get("sync") === "1";
  
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(`[Debug] ${msg}`); };

  try {
    log("Starting...");
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondSuccess({ logs, error: "Not logged in" });
    
    const adminSupabase = createAdminClient();
    const { data: account } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .single();

    if (!account) return respondSuccess({ logs, error: "No account" });
    
    const emailAccount = account as EmailAccount;
    log(`Account: ${emailAccount.mailbox}`);

    const accessToken = await ensureValidToken(emailAccount);
    log("Token OK");

    // Fetch inbox
    const inboxUrl = `${GRAPH_BASE_URL}/me/mailFolders/inbox/messages?$top=20&$select=id,conversationId,subject,bodyPreview,from,toRecipients,isRead,hasAttachments,receivedDateTime`;
    const inboxRes = await fetch(inboxUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!inboxRes.ok) {
      log(`Inbox error: ${inboxRes.status}`);
      return respondSuccess({ logs, error: "Inbox fetch failed" });
    }
    
    const inboxData = await inboxRes.json();
    const messages = inboxData.value || [];
    log(`Fetched ${messages.length} messages`);

    if (!doSync) {
      return respondSuccess({ 
        logs, 
        messages: messages.map((m: any) => ({ 
          subject: m.subject, 
          from: m.from?.emailAddress?.address 
        })),
        hint: "Add ?sync=1 to actually insert into database"
      });
    }

    // DO THE SYNC
    log("Starting sync...");
    
    let threadsInserted = 0;
    let messagesInserted = 0;
    
    for (const msg of messages) {
      // Check if thread exists
      const { data: existingThread } = await adminSupabase
        .from("email_threads")
        .select("id")
        .eq("account_id", emailAccount.id)
        .eq("graph_conversation_id", msg.conversationId)
        .single();

      let threadId: string;
      
      if (existingThread) {
        threadId = existingThread.id;
        log(`Thread exists: ${msg.conversationId.slice(0, 20)}...`);
      } else {
        // Create thread
        const participants: string[] = [];
        if (msg.from?.emailAddress?.address) {
          const addr = msg.from.emailAddress.address;
          const name = msg.from.emailAddress.name;
          participants.push(name ? `${name} <${addr}>` : addr);
        }
        
        const { data: newThread, error: threadErr } = await adminSupabase
          .from("email_threads")
          .insert({
            account_id: emailAccount.id,
            graph_conversation_id: msg.conversationId,
            subject: msg.subject || "(No subject)",
            snippet: msg.bodyPreview?.slice(0, 200) || "",
            folder: "inbox",
            participants,
            is_read: msg.isRead ?? false,
            has_attachments: msg.hasAttachments ?? false,
            last_message_at: msg.receivedDateTime,
          })
          .select("id")
          .single();

        if (threadErr) {
          log(`Thread insert error: ${threadErr.message}`);
          continue;
        }
        
        threadId = newThread.id;
        threadsInserted++;
        log(`Created thread: ${threadId}`);
      }

      // Check if message exists
      const { data: existingMsg } = await adminSupabase
        .from("email_messages")
        .select("id")
        .eq("graph_message_id", msg.id)
        .single();

      if (existingMsg) {
        log(`Message exists: ${msg.id.slice(0, 20)}...`);
        continue;
      }

      // Create message
      const { error: msgErr } = await adminSupabase
        .from("email_messages")
        .insert({
          thread_id: threadId,
          graph_message_id: msg.id,
          sender_email: msg.from?.emailAddress?.address || emailAccount.mailbox,
          sender_name: msg.from?.emailAddress?.name || "Unknown",
          recipients: msg.toRecipients?.map((r: any) => r.emailAddress?.address).filter(Boolean) || [],
          cc: [],
          bcc: [],
          subject: msg.subject || "(No subject)",
          body_preview: msg.bodyPreview?.slice(0, 200) || "",
          is_read: msg.isRead ?? false,
          has_attachments: msg.hasAttachments ?? false,
          received_at: msg.receivedDateTime,
        });

      if (msgErr) {
        log(`Message insert error: ${msgErr.message}`);
      } else {
        messagesInserted++;
        log(`Created message for: ${msg.subject?.slice(0, 30)}...`);
      }
    }

    log(`Done! Inserted ${threadsInserted} threads, ${messagesInserted} messages`);

    // Verify
    const { count } = await adminSupabase
      .from("email_threads")
      .select("*", { count: "exact", head: true })
      .eq("account_id", emailAccount.id);

    log(`Total threads in DB now: ${count}`);

    return respondSuccess({ 
      logs,
      result: {
        threadsInserted,
        messagesInserted,
        totalThreads: count
      }
    });

  } catch (err) {
    log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return respondSuccess({ logs, error: String(err) });
  }
}
