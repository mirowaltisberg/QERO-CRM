import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tma/[id]/claim - Claim a TMA candidate
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Update the candidate with claimed_by
  const { data: candidate, error } = await supabase
    .from("tma_candidates")
    .update({ claimed_by: user.id })
    .eq("id", id)
    .select(`
      *,
      claimer:profiles!claimed_by(id, full_name, avatar_url)
    `)
    .single();

  if (error) {
    console.error("Failed to claim candidate:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: candidate });
}

