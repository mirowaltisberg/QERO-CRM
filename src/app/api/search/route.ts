import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { geocodeSwissLocation, getBoundingBox, haversineDistance } from "@/lib/geo";

export interface SearchResultContact {
  id: string;
  type: "contact";
  company_name: string;
  contact_name: string | null;
  email: string | null;
  canton: string | null;
  team_id: string | null;
  team: { name: string; color: string } | null;
  distance_km?: number;
}

export interface SearchResultTma {
  id: string;
  type: "tma";
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position_title: string | null;
  canton: string | null;
  team_id: string | null;
  team: { name: string; color: string } | null;
  distance_km?: number;
}

export type SearchResult = SearchResultContact | SearchResultTma;

interface LocationInfo {
  name: string;
  plz: string;
  lat: number;
  lng: number;
}

const MAX_RESULTS_PER_TYPE = 10;
const DEFAULT_RADIUS_KM = 25;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const locationQuery = searchParams.get("location")?.trim();
    const radiusKm = parseFloat(searchParams.get("radius") || String(DEFAULT_RADIUS_KM));

    // Location-based search
    if (locationQuery && locationQuery.length >= 2) {
      return handleLocationSearch(supabase, locationQuery, radiusKm);
    }

    // Text-based search
    if (!query || query.length < 2) {
      return respondSuccess({ contacts: [], tma: [] });
    }

    return handleTextSearch(supabase, query);
  } catch (error) {
    console.error("[Search] Unexpected error:", error);
    return respondError("Search failed", 500);
  }
}

async function handleTextSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string
) {
  const searchPattern = `%${query}%`;

  // Search contacts across ALL teams
  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select(`
      id,
      company_name,
      contact_name,
      email,
      canton,
      team_id
    `)
    .or(`company_name.ilike.${searchPattern},contact_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
    .limit(MAX_RESULTS_PER_TYPE);

  if (contactsError) {
    console.error("[Search] Contacts error:", contactsError);
  }

  // Search TMA candidates across ALL teams
  const { data: tma, error: tmaError } = await supabase
    .from("tma_candidates")
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone,
      position_title,
      canton,
      team_id
    `)
    .or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`)
    .limit(MAX_RESULTS_PER_TYPE);

  if (tmaError) {
    console.error("[Search] TMA error:", tmaError);
  }

  // Get team info
  const teamsMap = await fetchTeamsMap(supabase, contacts || [], tma || []);

  // Transform results
  const contactResults: SearchResultContact[] = (contacts || []).map((c) => ({
    id: c.id,
    type: "contact" as const,
    company_name: c.company_name,
    contact_name: c.contact_name,
    email: c.email,
    canton: c.canton,
    team_id: c.team_id,
    team: c.team_id ? teamsMap[c.team_id] || null : null,
  }));

  const tmaResults: SearchResultTma[] = (tma || []).map((t) => ({
    id: t.id,
    type: "tma" as const,
    first_name: t.first_name,
    last_name: t.last_name,
    email: t.email,
    phone: t.phone,
    position_title: t.position_title,
    canton: t.canton,
    team_id: t.team_id,
    team: t.team_id ? teamsMap[t.team_id] || null : null,
  }));

  return respondSuccess({
    contacts: contactResults,
    tma: tmaResults,
  });
}

async function handleLocationSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  locationQuery: string,
  radiusKm: number
) {
  // Geocode the location
  const location = geocodeSwissLocation(locationQuery);
  if (!location) {
    return respondSuccess({
      contacts: [],
      tma: [],
      location: null,
      radius_km: radiusKm,
    });
  }

  // Get bounding box for efficient DB filtering
  const bbox = getBoundingBox(location.lat, location.lng, radiusKm);

  // Search contacts within bounding box
  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select(`
      id,
      company_name,
      contact_name,
      email,
      canton,
      team_id,
      latitude,
      longitude
    `)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("latitude", bbox.minLat)
    .lte("latitude", bbox.maxLat)
    .gte("longitude", bbox.minLng)
    .lte("longitude", bbox.maxLng)
    .limit(100); // Fetch more, filter by exact distance

  if (contactsError) {
    console.error("[Search] Location contacts error:", contactsError);
  }

  // Search TMA candidates within bounding box
  const { data: tma, error: tmaError } = await supabase
    .from("tma_candidates")
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone,
      position_title,
      canton,
      team_id,
      latitude,
      longitude
    `)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("latitude", bbox.minLat)
    .lte("latitude", bbox.maxLat)
    .gte("longitude", bbox.minLng)
    .lte("longitude", bbox.maxLng)
    .limit(100);

  if (tmaError) {
    console.error("[Search] Location TMA error:", tmaError);
  }

  // Calculate exact distances and filter by radius
  const contactsWithDistance = (contacts || [])
    .map((c) => ({
      ...c,
      distance_km: haversineDistance(
        location.lat,
        location.lng,
        c.latitude!,
        c.longitude!
      ),
    }))
    .filter((c) => c.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, MAX_RESULTS_PER_TYPE);

  const tmaWithDistance = (tma || [])
    .map((t) => ({
      ...t,
      distance_km: haversineDistance(
        location.lat,
        location.lng,
        t.latitude!,
        t.longitude!
      ),
    }))
    .filter((t) => t.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, MAX_RESULTS_PER_TYPE);

  // Get team info
  const teamsMap = await fetchTeamsMap(supabase, contactsWithDistance, tmaWithDistance);

  // Transform results
  const contactResults: SearchResultContact[] = contactsWithDistance.map((c) => ({
    id: c.id,
    type: "contact" as const,
    company_name: c.company_name,
    contact_name: c.contact_name,
    email: c.email,
    canton: c.canton,
    team_id: c.team_id,
    team: c.team_id ? teamsMap[c.team_id] || null : null,
    distance_km: Math.round(c.distance_km * 10) / 10, // Round to 1 decimal
  }));

  const tmaResults: SearchResultTma[] = tmaWithDistance.map((t) => ({
    id: t.id,
    type: "tma" as const,
    first_name: t.first_name,
    last_name: t.last_name,
    email: t.email,
    phone: t.phone,
    position_title: t.position_title,
    canton: t.canton,
    team_id: t.team_id,
    team: t.team_id ? teamsMap[t.team_id] || null : null,
    distance_km: Math.round(t.distance_km * 10) / 10,
  }));

  const locationInfo: LocationInfo = {
    name: location.name,
    plz: location.plz,
    lat: location.lat,
    lng: location.lng,
  };

  return respondSuccess({
    contacts: contactResults,
    tma: tmaResults,
    location: locationInfo,
    radius_km: radiusKm,
  });
}

async function fetchTeamsMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contacts: Array<{ team_id: string | null }>,
  tma: Array<{ team_id: string | null }>
): Promise<Record<string, { name: string; color: string }>> {
  const teamIds = new Set<string>();
  for (const c of contacts) {
    if (c.team_id) teamIds.add(c.team_id);
  }
  for (const t of tma) {
    if (t.team_id) teamIds.add(t.team_id);
  }

  if (teamIds.size === 0) {
    return {};
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, color")
    .in("id", Array.from(teamIds));

  if (!teams) {
    return {};
  }

  return Object.fromEntries(
    teams.map((t) => [t.id, { name: t.name, color: t.color || "#6B7280" }])
  );
}
