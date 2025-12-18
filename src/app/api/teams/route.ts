import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/teams
 * Fetch all teams (for team filter dropdown)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all teams
    const { data: teams, error } = await supabase
      .from("teams")
      .select("id, name, color, created_at")
      .order("name", { ascending: true });

    if (error) {
      console.error("[Teams API] Error fetching teams:", error);
      return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
    }

    return NextResponse.json({ data: teams || [] });
  } catch (error) {
    console.error("[Teams API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
