import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

// GET /api/email/account - Get current user's email account status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { data: account, error } = await supabase
      .from("email_accounts")
      .select("id, provider, mailbox, last_sync_at, sync_error, created_at")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch email account:", error);
      return respondError("Failed to fetch email account", 500);
    }

    return respondSuccess(account);
  } catch (err) {
    console.error("Email account fetch error:", err);
    return respondError("Failed to fetch email account", 500);
  }
}

