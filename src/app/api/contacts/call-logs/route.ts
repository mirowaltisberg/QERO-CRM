import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

// POST /api/contacts/call-logs - Get latest call logs for multiple contacts (batch)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const body = await request.json();
    const { contact_ids } = body;

    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return respondError("contact_ids array required", 400);
    }

    // Limit batch size to prevent abuse
    if (contact_ids.length > 500) {
      return respondError("Maximum 500 contacts per batch", 400);
    }

    const adminSupabase = createAdminClient();

    // Get user's team
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();

    if (!profile?.team_id) {
      return respondError("User has no team", 400);
    }

    // Verify all contacts belong to user's team
    const { data: validContacts } = await adminSupabase
      .from("contacts")
      .select("id")
      .eq("team_id", profile.team_id)
      .in("id", contact_ids);

    const validContactIds = new Set(validContacts?.map(c => c.id) || []);

    // Get latest call log for each contact using a subquery approach
    // This gets the most recent call log per contact in a single query
    const { data: callLogs, error } = await adminSupabase
      .from("contact_call_logs")
      .select(`
        id,
        contact_id,
        called_at,
        user_id,
        caller:profiles!contact_call_logs_user_id_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
      .in("contact_id", Array.from(validContactIds))
      .order("called_at", { ascending: false });

    if (error) {
      console.error("[Call Logs Batch] Error:", error);
      return respondError("Failed to fetch call logs", 500);
    }

    // Group by contact_id and keep only the latest per contact
    const latestByContact: Record<string, typeof callLogs[0]> = {};
    for (const log of callLogs || []) {
      if (!latestByContact[log.contact_id]) {
        latestByContact[log.contact_id] = log;
      }
    }

    return respondSuccess(latestByContact);
  } catch (err) {
    console.error("[Call Logs Batch] Error:", err);
    return respondError("Failed to fetch call logs", 500);
  }
}
