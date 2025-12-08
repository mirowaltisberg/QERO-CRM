import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string; tmaId: string }>;
}

/**
 * PATCH /api/vacancies/[id]/candidates/[tmaId] - Update candidate status in vacancy
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, tmaId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { status, notes } = body;

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: vacancyCandidate, error } = await supabase
      .from("vacancy_candidates")
      .update(updateData)
      .eq("vacancy_id", id)
      .eq("tma_id", tmaId)
      .select(`
        *,
        tma:tma_candidates(
          *,
          claimer:profiles!tma_candidates_claimed_by_fkey(id, full_name, avatar_url)
        )
      `)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Vacancy candidate not found" }, { status: 404 });
      }
      console.error("[Candidate API] Error updating candidate:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(vacancyCandidate);
  } catch (error) {
    console.error("[Candidate API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/vacancies/[id]/candidates/[tmaId] - Remove candidate from vacancy
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, tmaId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("vacancy_candidates")
      .delete()
      .eq("vacancy_id", id)
      .eq("tma_id", tmaId);

    if (error) {
      console.error("[Candidate API] Error removing candidate:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Candidate API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
