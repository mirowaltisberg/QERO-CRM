import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, markMessageRead, moveMessage } from "@/lib/email/graph-client";
import type { EmailAccount } from "@/lib/email/graph-client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/email/threads/[id] - Get single thread with all messages
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Fetch thread with messages
    const { data: thread, error } = await supabase
      .from("email_threads")
      .select(`
        *,
        messages:email_messages(
          *
        ),
        linked_contact:contacts(id, company_name, contact_name, email),
        linked_tma:tma_candidates(id, first_name, last_name, email)
      `)
      .eq("id", id)
      .single();

    if (error || !thread) {
      return respondError("Thread not found", 404);
    }

    // Verify user owns this thread's account
    const { data: account } = await supabase
      .from("email_accounts")
      .select("id")
      .eq("id", thread.account_id)
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return respondError("Thread not found", 404);
    }

    // Sort messages by date
    if (thread.messages) {
      thread.messages.sort((a: { received_at: string | null; sent_at: string | null }, b: { received_at: string | null; sent_at: string | null }) => {
        const dateA = new Date(a.received_at || a.sent_at || 0);
        const dateB = new Date(b.received_at || b.sent_at || 0);
        return dateA.getTime() - dateB.getTime();
      });
    }

    return respondSuccess(thread);
  } catch (err) {
    console.error("Email thread error:", err);
    return respondError("Failed to fetch email", 500);
  }
}

// PATCH /api/email/threads/[id] - Update thread (mark read, star, move)
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const body = await request.json();
    const { is_read, is_starred, folder, linked_contact_id, linked_tma_id } = body;

    // Get thread and verify ownership
    const { data: thread, error: threadError } = await supabase
      .from("email_threads")
      .select("*, account:email_accounts!inner(id, user_id)")
      .eq("id", id)
      .single();

    if (threadError || !thread || thread.account.user_id !== user.id) {
      return respondError("Thread not found", 404);
    }

    // Build update payload
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (is_read !== undefined) updates.is_read = is_read;
    if (is_starred !== undefined) updates.is_starred = is_starred;
    if (folder !== undefined) updates.folder = folder;
    if (linked_contact_id !== undefined) updates.linked_contact_id = linked_contact_id;
    if (linked_tma_id !== undefined) updates.linked_tma_id = linked_tma_id;

    // If marking read/unread or moving, sync with Graph API
    if (is_read !== undefined || folder !== undefined) {
      const adminSupabase = createAdminClient();
      const { data: account } = await adminSupabase
        .from("email_accounts")
        .select("*")
        .eq("id", thread.account_id)
        .single();

      if (account) {
        const emailAccount = account as EmailAccount;
        const accessToken = await ensureValidToken(emailAccount);

        // Get all messages in thread to update
        const { data: messages } = await supabase
          .from("email_messages")
          .select("graph_message_id")
          .eq("thread_id", id);

        if (messages) {
          for (const msg of messages) {
            if (is_read !== undefined) {
              await markMessageRead(accessToken, msg.graph_message_id, is_read);
            }
            if (folder !== undefined) {
              const folderMap: Record<string, "archive" | "deleteditems" | "inbox"> = {
                archive: "archive",
                trash: "deleteditems",
                inbox: "inbox",
              };
              if (folderMap[folder]) {
                await moveMessage(accessToken, msg.graph_message_id, folderMap[folder]);
              }
            }
          }
        }
      }
    }

    // Update in database
    const { data: updated, error: updateError } = await supabase
      .from("email_threads")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update thread:", updateError);
      return respondError("Failed to update email", 500);
    }

    // Also update messages' is_read status
    if (is_read !== undefined) {
      await supabase
        .from("email_messages")
        .update({ is_read })
        .eq("thread_id", id);
    }

    return respondSuccess(updated);
  } catch (err) {
    console.error("Email thread update error:", err);
    return respondError("Failed to update email", 500);
  }
}

