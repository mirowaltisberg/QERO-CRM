import { NextRequest } from "next/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { createClient } from "@/lib/supabase/server";
import { geocodeSwissLocation, geocodeByPostalOrCity, getBoundingBox, haversineDistance } from "@/lib/geo";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    const DEFAULT_ELEKTRO_TEAM = "00000000-0000-0000-0000-000000000010";
    const teamId = profile?.team_id || DEFAULT_ELEKTRO_TEAM;

    const { searchParams } = new URL(request.url);
    const locationQuery = searchParams.get("location");
    const radiusKm = parseFloat(searchParams.get("radius") || "25");
    const status = searchParams.get("status");
    const activity = searchParams.get("activity");
    const canton = searchParams.get("canton");

    if (!locationQuery) {
      return respondError("Location query is required", 400);
    }

    if (isNaN(radiusKm) || radiusKm <= 0 || radiusKm > 200) {
      return respondError("Radius must be between 1 and 200 km", 400);
    }

    // Geocode the location query
    const location = geocodeSwissLocation(locationQuery);
    if (!location) {
      return respondError(`Could not find location: ${locationQuery}`, 404);
    }

    // Ensure existing candidates have coordinates populated
    await backfillMissingCoordinates(supabase, teamId);

    // Get bounding box for initial filter
    const bbox = getBoundingBox(location.lat, location.lng, radiusKm);

    // Build query with bounding box filter
    let query = supabase
      .from("tma_candidates")
      .select(`
        id,
        first_name,
        last_name,
        phone,
        email,
        canton,
        city,
        street,
        postal_code,
        status,
        status_tags,
        activity,
        position_title,
        notes,
        latitude,
        longitude,
        follow_up_at,
        follow_up_note,
        cv_url,
        references_url,
        short_profile_url,
        team_id,
        created_at,
        claimed_by,
        claimer:profiles!tma_candidates_claimed_by_fkey(id, full_name, avatar_url)
      `)
      .eq("team_id", teamId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .gte("latitude", bbox.minLat)
      .lte("latitude", bbox.maxLat)
      .gte("longitude", bbox.minLng)
      .lte("longitude", bbox.maxLng);

    // Apply additional filters
    if (status) {
      query = query.contains("status_tags", [status]);
    }
    if (activity) {
      query = query.eq("activity", activity);
    }
    if (canton) {
      query = query.eq("canton", canton);
    }

    const { data: candidates, error } = await query;

    if (error) {
      console.error("[TMA Search] Query error:", error);
      return respondError(error.message, 500);
    }

    // Calculate exact distances and filter by radius
    const resultsWithDistance = (candidates || [])
      .map((candidate) => {
        const distance = haversineDistance(
          location.lat,
          location.lng,
          candidate.latitude!,
          candidate.longitude!
        );
        return {
          ...candidate,
          distance_km: Math.round(distance * 10) / 10, // Round to 1 decimal
        };
      })
      .filter((c) => c.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);

    // Transform claimer from array to single object (Supabase returns array for joins)
    const transformedResults = resultsWithDistance.map((c) => ({
      ...c,
      claimer: Array.isArray(c.claimer) && c.claimer.length > 0 ? c.claimer[0] : null,
    }));

    return respondSuccess({
      candidates: transformedResults,
      location: {
        name: location.name,
        plz: location.plz,
        lat: location.lat,
        lng: location.lng,
      },
      radius_km: radiusKm,
      total: transformedResults.length,
    });
  } catch (error) {
    console.error("[TMA Search] Unexpected error:", error);
    return respondError(
      error instanceof Error ? error.message : "Search failed",
      500
    );
  }
}

async function backfillMissingCoordinates(
  supabaseClient: Awaited<ReturnType<typeof createClient>>,
  teamId: string
) {
  const { data: missingRows, error } = await supabaseClient
    .from("tma_candidates")
    .select("id, postal_code, city")
    .eq("team_id", teamId)
    .is("latitude", null)
    .limit(150);

  if (error || !missingRows?.length) {
    return;
  }

  for (const row of missingRows) {
    const coords = geocodeByPostalOrCity(row.postal_code, row.city);
    if (!coords) continue;

    await supabaseClient
      .from("tma_candidates")
      .update({ latitude: coords.lat, longitude: coords.lng })
      .eq("id", row.id);
  }
}

