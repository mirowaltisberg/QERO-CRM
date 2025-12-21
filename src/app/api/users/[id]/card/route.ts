import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]/card
 * Returns user profile + stats for the user card popup
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: targetUserId } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetUserId)) {
      return respondError("Invalid user ID format", 400);
    }

    const adminSupabase = createAdminClient();

    // Fetch profile with team info
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select(`
        id,
        full_name,
        avatar_url,
        email,
        phone,
        team_id,
        team:teams(id, name, color)
      `)
      .eq("id", targetUserId)
      .single();

    if (profileError || !profile) {
      console.error("[User Card] Profile not found:", profileError);
      return respondError("User not found", 404);
    }

    // Calculate time boundaries (matching dashboard logic)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    // Count calls today (count-only query for efficiency)
    const { count: callsToday } = await adminSupabase
      .from("contact_call_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .gte("called_at", todayStart.toISOString());

    // Count calls this week
    const { count: callsThisWeek } = await adminSupabase
      .from("contact_call_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .gte("called_at", weekStart.toISOString());

    // Count claimed TMA candidates
    const { count: claimedTmaCount } = await adminSupabase
      .from("tma_candidates")
      .select("*", { count: "exact", head: true })
      .eq("claimed_by", targetUserId);

    // Count assigned WhatsApp conversations (optional)
    const { count: assignedWhatsappCount } = await adminSupabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", targetUserId);

    // Handle team being an array (Supabase sometimes returns arrays for joins)
    const team = Array.isArray(profile.team) ? profile.team[0] : profile.team;

    return respondSuccess({
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        email: profile.email,
        phone: profile.phone,
        team_id: profile.team_id,
        team: team || null,
      },
      stats: {
        callsToday: callsToday ?? 0,
        callsThisWeek: callsThisWeek ?? 0,
        claimedTmaCount: claimedTmaCount ?? 0,
        assignedWhatsappCount: assignedWhatsappCount ?? 0,
      },
    });
  } catch (err) {
    console.error("[User Card] Error:", err);
    return respondError("Failed to fetch user card data", 500);
  }
}

