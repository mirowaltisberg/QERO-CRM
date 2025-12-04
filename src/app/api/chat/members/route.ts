import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();
    
    const { data: profiles, error: profilesError } = await adminSupabase
      .from("profiles")
      .select("id, full_name, avatar_url, team_id")
      .order("full_name");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      return respondError("Failed to fetch members", 500);
    }

    const { data: teams } = await adminSupabase
      .from("teams")
      .select("id, name, color");

    const teamsMap = new Map((teams || []).map(t => [t.id, t]));

    const membersWithTeams = (profiles || []).map(p => ({
      ...p,
      team: p.team_id ? teamsMap.get(p.team_id) || null : null,
    }));

    return respondSuccess(membersWithTeams);
  } catch (err) {
    console.error("GET members error:", err);
    return respondError("Failed to fetch members", 500);
  }
}
