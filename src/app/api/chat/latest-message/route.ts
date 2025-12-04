import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

// GET /api/chat/latest-message - Get the latest message from any room the user is in
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();

    // Get all rooms the user is a member of
    const { data: memberships } = await adminSupabase
      .from("chat_room_members")
      .select("room_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return respondSuccess(null);
    }

    const roomIds = memberships.map(m => m.room_id);

    // Get the latest message from any of these rooms
    const { data: message, error } = await adminSupabase
      .from("chat_messages")
      .select("id, room_id, sender_id, content, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching latest message:", error);
      return respondError("Failed to fetch latest message", 500);
    }

    return respondSuccess(message || null);
  } catch (err) {
    console.error("GET /api/chat/latest-message error:", err);
    return respondError("Internal server error", 500);
  }
}
