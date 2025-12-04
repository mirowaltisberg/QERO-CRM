import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();
    const { data: profiles, error } = await adminSupabase
      .from("profiles")
      .select("id, full_name, avatar_url, team_id, team:teams!team_id(id, name, color)")
      .order("full_name");

    if (error) return respondError("Failed to fetch members", 500);
    return respondSuccess(profiles || []);
  } catch (err) {
    console.error("GET members error:", err);
    return respondError("Failed to fetch members", 500);
  }
}
