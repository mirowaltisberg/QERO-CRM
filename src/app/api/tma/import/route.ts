import { NextRequest } from "next/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TmaCreateSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();

    const activeTeamId =
      profile?.team_id || "00000000-0000-0000-0000-000000000010"; // default Elektro

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body)) {
      return respondError("Payload must be an array of candidates", 400);
    }

    let success = 0;
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < body.length; i++) {
      const row = body[i];
      const parsed = TmaCreateSchema.safeParse({
        ...row,
        team_id: row.team_id ?? activeTeamId,
      });
      if (!parsed.success) {
        errors.push({ index: i, message: parsed.error.message });
        continue;
      }
      try {
        await supabaseAdmin.from("tma_candidates").insert(parsed.data);
        success += 1;
      } catch (err) {
        errors.push({ index: i, message: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    return respondSuccess({ created: success, errors }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tma/import error", error);
    return respondError("Failed to import candidates", 500);
  }
}


