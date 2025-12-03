import { NextRequest } from "next/server";
import { respondError, respondSuccess, formatZodError } from "@/lib/utils/api-response";
import { createClient } from "@/lib/supabase/server";
import { TmaRoleCreateSchema } from "@/lib/validation/schemas";

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

export async function GET() {
  try {
    const { supabase, teamId } = await getSupabaseWithTeam();
    const { data: roles, error } = await supabase
      .from("tma_roles")
      .select("*")
      .eq("team_id", teamId)
      .order("name", { ascending: true });

    if (error) {
      console.error("[GET /api/tma/roles] Error fetching roles", error);
      return respondError("Failed to load roles", 500);
    }

    return respondSuccess(roles ?? []);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return respondError("Unauthorized", 401);
    }
    if (error instanceof Error && error.message === "PROFILE_ERROR") {
      return respondError("Failed to load profile", 500);
    }
    console.error("[GET /api/tma/roles] Unexpected error", error);
    return respondError("Failed to load roles", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return respondError("Invalid JSON payload", 400);
    }

    const parsed = TmaRoleCreateSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(formatZodError(parsed.error), 400);
    }

    const { supabase, teamId } = await getSupabaseWithTeam();
    const payload = {
      ...parsed.data,
      team_id: teamId,
    };

    const { data, error } = await supabase
      .from("tma_roles")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      if ("code" in error && error.code === "23505") {
        return respondError("A role with this name already exists", 409);
      }
      console.error("[POST /api/tma/roles] Insert error", error);
      return respondError("Failed to create role", 500);
    }

    return respondSuccess(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return respondError("Unauthorized", 401);
    }
    if (error instanceof Error && error.message === "PROFILE_ERROR") {
      return respondError("Failed to load profile", 500);
    }
    console.error("[POST /api/tma/roles] Unexpected error", error);
    return respondError("Failed to create role", 500);
  }
}

