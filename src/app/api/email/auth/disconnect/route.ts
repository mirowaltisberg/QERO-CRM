import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Delete the email account (cascades to threads, messages, attachments)
    const { error } = await supabase
      .from("email_accounts")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", "outlook");

    if (error) {
      console.error("Failed to disconnect email:", error);
      return respondError("Failed to disconnect email account", 500);
    }

    return respondSuccess({ disconnected: true });
  } catch (err) {
    console.error("Disconnect error:", err);
    return respondError("Failed to disconnect email account", 500);
  }
}

