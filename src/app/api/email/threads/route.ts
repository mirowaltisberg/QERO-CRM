import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import type { EmailFolder } from "@/lib/types";

const PAGE_SIZE = 500;

// GET /api/email/threads - List email threads
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Get user's email account
    const { data: account, error: accountError } = await supabase
      .from("email_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .single();

    if (accountError || !account) {
      return respondError("No email account connected", 404);
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const folder = (searchParams.get("folder") || "inbox") as EmailFolder;
    const isStarred = searchParams.get("starred") === "true";
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || String(PAGE_SIZE), 10);

    // Build query
    let query = supabase
      .from("email_threads")
      .select(`
        *,
        messages:email_messages(
          id,
          graph_message_id,
          sender_email,
          sender_name,
          recipients,
          cc,
          bcc,
          subject,
          body_preview,
          body_html,
          body_text,
          is_read,
          has_attachments,
          sent_at,
          received_at
        )
      `, { count: "exact" })
      .eq("account_id", account.id)
      .eq("folder", folder)
      .order("last_message_at", { ascending: false });

    if (isStarred) {
      query = query.eq("is_starred", true);
    }

    if (search) {
      query = query.or(`subject.ilike.%${search}%,snippet.ilike.%${search}%`);
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: threads, error, count } = await query;

    if (error) {
      console.error("[Threads API] Query error:", error);
      return respondError("Failed to fetch emails", 500);
    }

    return respondSuccess({
      threads: threads || [],
      total: count || 0,
      page,
      pageSize,
      hasMore: (count || 0) > page * pageSize,
    });
  } catch (err) {
    console.error("[Threads API] Unexpected error:", err);
    return respondError("Failed to fetch emails", 500);
  }
}
