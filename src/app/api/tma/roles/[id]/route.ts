import { NextRequest } from "next/server";
import { respondError, respondSuccess, formatZodError } from "@/lib/utils/api-response";
import { createClient } from "@/lib/supabase/server";
import { TmaRoleUpdateSchema } from "@/lib/validation/schemas";

const DEFAULT_ELEKTRO_TEAM = "00000000-0000-0000-0000-000000000010";

async function getSupabaseWithTeam() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("Failed to load user profile", profileError);
    throw new Error("PROFILE_ERROR");
  }

  const teamId = profile?.team_id || DEFAULT_ELEKTRO_TEAM;
  return { supabase, teamId };
}

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return respondError("Invalid JSON payload", 400);
    }

    const parsed = TmaRoleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(formatZodError(parsed.error), 400);
    }

    const { supabase, teamId } = await getSupabaseWithTeam();
    const { data, error } = await supabase
      .from("tma_roles")
      .update(parsed.data)
      .eq("id", id)
      .eq("team_id", teamId)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return respondError("Role not found", 404);
      }
      if (error.code === "23505") {
        return respondError("A role with this name already exists", 409);
      }
      console.error(`[PATCH /api/tma/roles/${id}] Update error`, error);
      return respondError("Failed to update role", 500);
    }

    return respondSuccess(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return respondError("Unauthorized", 401);
    }
    if (error instanceof Error && error.message === "PROFILE_ERROR") {
      return respondError("Failed to load profile", 500);
    }
    console.error(`[PATCH /api/tma/roles/${id}] Unexpected error`, error);
    return respondError("Failed to update role", 500);
  }
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const { supabase, teamId } = await getSupabaseWithTeam();
    const { data, error } = await supabase
      .from("tma_roles")
      .delete()
      .eq("id", id)
      .eq("team_id", teamId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(`[DELETE /api/tma/roles/${id}] Delete error`, error);
      return respondError("Failed to delete role", 500);
    }

    if (!data) {
      return respondError("Role not found", 404);
    }

    return respondSuccess({ id: data.id });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return respondError("Unauthorized", 401);
    }
    if (error instanceof Error && error.message === "PROFILE_ERROR") {
      return respondError("Failed to load profile", 500);
    }
    console.error(`[DELETE /api/tma/roles/${id}] Unexpected error`, error);
    return respondError("Failed to delete role", 500);
  }
}

