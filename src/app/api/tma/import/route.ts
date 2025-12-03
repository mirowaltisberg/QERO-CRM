import { NextRequest } from "next/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { createClient } from "@/lib/supabase/server";
import { TmaCreateSchema, type TmaCreateInput } from "@/lib/validation/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeByPostalOrCity } from "@/lib/geo";

type TmaImportPayload = Omit<TmaCreateInput, "team_id">;

interface TmaImportPayloadWithCoords extends TmaImportPayload {
  latitude?: number | null;
  longitude?: number | null;
}

const UPSERT_MUTABLE_FIELDS = [
  "phone",
  "email",
  "canton",
  "city",
  "street",
  "postal_code",
  "position_title",
  "short_profile_url",
  "cv_url",
  "references_url",
  "status_tags",
  "latitude",
  "longitude",
] as const satisfies ReadonlyArray<keyof TmaImportPayloadWithCoords>;

export async function POST(request: NextRequest) {
  console.log("[TMA Import] Starting import...");
  
  try {
    const supabase = await createClient();
    
    // Check if admin client is available
    const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log("[TMA Import] Service role key available:", hasServiceKey);
    
    let supabaseAdmin = null;
    if (hasServiceKey) {
      try {
        supabaseAdmin = createAdminClient();
        console.log("[TMA Import] Admin client created successfully");
      } catch (adminErr) {
        console.error("[TMA Import] Failed to create admin client:", adminErr);
      }
    }
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("[TMA Import] No authenticated user");
      return respondError("Unauthorized", 401);
    }
    console.log("[TMA Import] User authenticated:", user.id);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("[TMA Import] Profile fetch error:", profileError);
    }
    console.log("[TMA Import] Profile team_id:", profile?.team_id);

    // Default to Elektro team if user has no team assigned
    const DEFAULT_ELEKTRO_TEAM = "00000000-0000-0000-0000-000000000010";
    const activeTeamId = profile?.team_id && profile.team_id.length === 36 
      ? profile.team_id 
      : DEFAULT_ELEKTRO_TEAM;
    console.log("[TMA Import] Using team_id:", activeTeamId);

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body)) {
      console.log("[TMA Import] Invalid payload - not an array");
      return respondError("Payload must be an array of candidates", 400);
    }
    console.log("[TMA Import] Received", body.length, "rows");

    let success = 0;
    const errors: Array<{ index: number; message: string }> = [];

    // Use admin client if available, otherwise fall back to regular client
    const writer = supabaseAdmin ?? supabase;
    console.log("[TMA Import] Using", supabaseAdmin ? "admin" : "regular", "client for writes");

    for (let i = 0; i < body.length; i++) {
      const row = body[i];
      // Remove team_id from row - we'll add it after validation
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { team_id: _ignored, ...rowWithoutTeam } = row;
      
      // Validate without team_id, then add it after
      const parsed = TmaCreateSchema.safeParse(rowWithoutTeam);
      if (!parsed.success) {
        const errMsg = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        console.log(`[TMA Import] Row ${i} validation failed:`, errMsg);
        errors.push({ index: i, message: errMsg });
        continue;
      }
      
      const candidate = parsed.data as TmaImportPayload;
      
      // Geocode the candidate based on postal_code or city
      const coords = geocodeCandidate(candidate);
      const candidateWithCoords: TmaImportPayloadWithCoords = {
        ...candidate,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      };
      
      // Match by name (first_name + last_name) - case insensitive
      const normalizedFirstName = candidate.first_name.trim().toLowerCase();
      const normalizedLastName = candidate.last_name.trim().toLowerCase();

      let existingCandidateId: string | null = null;

      // First try to find by normalized name
      const { data: existingRows, error: lookupError } = await writer
        .from("tma_candidates")
        .select("id")
        .ilike("first_name", normalizedFirstName)
        .ilike("last_name", normalizedLastName)
        .limit(1);

      if (lookupError) {
        console.log(`[TMA Import] Row ${i} lookup failed:`, lookupError.message);
        errors.push({ index: i, message: lookupError.message });
        continue;
      }

      if (existingRows && existingRows.length > 0) {
        existingCandidateId = existingRows[0].id;
        console.log(`[TMA Import] Row ${i} matched existing candidate by name: ${normalizedFirstName} ${normalizedLastName}`);
      }

      if (existingCandidateId) {
        const updatePayload = buildUpdatePayload(candidateWithCoords);

        if (Object.keys(updatePayload).length === 0) {
          console.log(`[TMA Import] Row ${i} skipped - no new fields to update`);
          success += 1;
          continue;
        }

        const { error: updateError } = await writer
          .from("tma_candidates")
          .update(updatePayload)
          .eq("id", existingCandidateId);

        if (updateError) {
          console.log(`[TMA Import] Row ${i} update failed:`, updateError.message, updateError.code);
          errors.push({ index: i, message: updateError.message });
        } else {
          success += 1;
        }
        continue;
      }

      const dataToInsert = {
        ...candidateWithCoords,
        team_id: activeTeamId,
      };
      
      const { error: insertError } = await writer.from("tma_candidates").insert(dataToInsert);
      if (insertError) {
        console.log(`[TMA Import] Row ${i} insert failed:`, insertError.message, insertError.code);
        errors.push({ index: i, message: insertError.message });
      } else {
        success += 1;
      }
    }

    console.log("[TMA Import] Complete. Success:", success, "Errors:", errors.length);
    return respondSuccess({ created: success, errors }, { status: 201 });
  } catch (error) {
    console.error("[TMA Import] Unexpected error:", error);
    return respondError(
      error instanceof Error ? error.message : "Failed to import candidates",
      500
    );
  }
}

function buildUpdatePayload(candidate: TmaImportPayloadWithCoords) {
  const payload: Partial<TmaImportPayloadWithCoords> = {};
  for (const field of UPSERT_MUTABLE_FIELDS) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (field === "status_tags") {
      if (Array.isArray(value) && value.length > 0) {
        payload.status_tags = value;
      }
      continue;
    }
    // Allow null for coordinates (to clear them if needed)
    if (field !== "latitude" && field !== "longitude") {
      if (value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
    }
    (payload as Record<string, unknown>)[field] = value;
  }
  return payload;
}

/**
 * Geocode a candidate based on postal_code or city
 */
function geocodeCandidate(candidate: TmaImportPayload): { lat: number; lng: number } | null {
  return geocodeByPostalOrCity(candidate.postal_code, candidate.city);
}
