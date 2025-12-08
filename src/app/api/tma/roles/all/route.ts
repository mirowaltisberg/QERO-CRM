import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/tma/roles/all - Fetch all roles from ALL teams
 * Used for vacancy role selection where we need cross-team visibility
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: roles, error } = await supabase
      .from("tma_roles")
      .select(`
        id,
        team_id,
        name,
        color,
        note,
        team:teams(id, name, color)
      `)
      .order("name", { ascending: true });

    if (error) {
      console.error("[GET /api/tma/roles/all] Error fetching roles:", error);
      return NextResponse.json({ error: "Failed to load roles" }, { status: 500 });
    }

    return NextResponse.json({ data: roles ?? [] });
  } catch (error) {
    console.error("[GET /api/tma/roles/all] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to load roles" }, { status: 500 });
  }
}
