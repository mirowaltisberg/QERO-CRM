import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tma/[id]/claim - Claim a TMA candidate
export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Claim the TMA
    const { error: updateError } = await supabase
      .from("tma_candidates")
      .update({ claimed_by: user.id })
      .eq("id", id);

    if (updateError) {
      console.error("Claim error:", updateError);
      return respondError(updateError.message, 500);
    }

    // Fetch updated record with claimer
    const { data: updated, error: fetchError } = await supabase
      .from("tma_candidates")
      .select(`
        *,
        claimer:profiles!claimed_by(id, full_name, avatar_url),
        address_updated_by_profile:profiles!address_updated_by(id, full_name, avatar_url)
      `)
      .eq("id", id)
      .single();

    if (fetchError || !updated) {
      console.error("Fetch error:", fetchError);
      return respondError("Candidate not found", 404);
    }

    return respondSuccess(updated);
  } catch (error) {
    console.error(`POST /api/tma/${id}/claim error`, error);
    return respondError("Failed to claim candidate", 500);
  }
}

// DELETE /api/tma/[id]/claim - Unclaim a TMA candidate
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Check if user owns this claim
    const { data: candidate } = await supabase
      .from("tma_candidates")
      .select("claimed_by")
      .eq("id", id)
      .single();

    if (candidate?.claimed_by !== user.id) {
      return respondError("You can only unclaim your own TMAs", 403);
    }

    // Unclaim the TMA
    const { error: updateError } = await supabase
      .from("tma_candidates")
      .update({ claimed_by: null })
      .eq("id", id);

    if (updateError) {
      console.error("Unclaim error:", updateError);
      return respondError(updateError.message, 500);
    }

    // Fetch updated record
    const { data: updated, error: fetchError } = await supabase
      .from("tma_candidates")
      .select(`
        *,
        claimer:profiles!claimed_by(id, full_name, avatar_url),
        address_updated_by_profile:profiles!address_updated_by(id, full_name, avatar_url)
      `)
      .eq("id", id)
      .single();

    if (fetchError || !updated) {
      console.error("Fetch error:", fetchError);
      return respondError("Candidate not found", 404);
    }

    return respondSuccess(updated);
  } catch (error) {
    console.error(`DELETE /api/tma/${id}/claim error`, error);
    return respondError("Failed to unclaim candidate", 500);
  }
}
