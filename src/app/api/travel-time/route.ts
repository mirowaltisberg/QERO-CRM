import { NextRequest } from "next/server";
import { respondSuccess, respondError } from "@/lib/utils/api-response";
import { parseTransportApiDuration } from "@/lib/geo/travel";

// In-memory cache with TTL (5 minutes)
const cache = new Map<string, { data: TravelTimeResult; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

interface TravelTimeResult {
  mode: "driving" | "transit";
  durationSeconds: number;
  durationMinutes: number;
  provider: string;
  originStation?: string;
  destStation?: string;
}

// ORS API constants
const ORS_API_URL = "https://api.openrouteservice.org/v2/directions/driving-car";

// Swiss transport API constants
const TRANSPORT_API_URL = "https://transport.opendata.ch/v1";

/**
 * Get driving time from OpenRouteService
 */
async function getDrivingTime(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<TravelTimeResult> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTESERVICE_API_KEY not configured");
  }

  // ORS expects [lng, lat] order
  const body = {
    coordinates: [
      [fromLng, fromLat],
      [toLng, toLat],
    ],
  };

  const response = await fetch(ORS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[TravelTime] ORS error:", response.status, errorText);
    throw new Error(`OpenRouteService error: ${response.status}`);
  }

  const data = await response.json();
  const durationSeconds = data.routes?.[0]?.summary?.duration ?? 0;

  return {
    mode: "driving",
    durationSeconds,
    durationMinutes: Math.round(durationSeconds / 60),
    provider: "OpenRouteService",
  };
}

/**
 * Find nearest station to coordinates using Swiss transport API
 */
async function findNearestStation(
  lat: number,
  lng: number
): Promise<{ id: string; name: string } | null> {
  // transport.opendata.ch uses x=lat, y=lng (unusual order)
  const url = `${TRANSPORT_API_URL}/locations?x=${lat}&y=${lng}&type=station`;
  
  const response = await fetch(url);
  if (!response.ok) {
    console.error("[TravelTime] Transport API locations error:", response.status);
    return null;
  }

  const data = await response.json();
  const stations = data.stations || [];
  
  if (stations.length === 0) {
    return null;
  }

  // Return the first (nearest) station
  return {
    id: stations[0].id,
    name: stations[0].name,
  };
}

/**
 * Get transit time from Swiss transport API
 */
async function getTransitTime(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<TravelTimeResult> {
  // Find nearest stations to origin and destination
  const [originStation, destStation] = await Promise.all([
    findNearestStation(fromLat, fromLng),
    findNearestStation(toLat, toLng),
  ]);

  if (!originStation) {
    throw new Error("Keine Station in der Nähe des Startorts gefunden");
  }
  if (!destStation) {
    throw new Error("Keine Station in der Nähe des Zielorts gefunden");
  }

  // Get connection between stations
  const connectionsUrl = `${TRANSPORT_API_URL}/connections?from=${encodeURIComponent(originStation.id)}&to=${encodeURIComponent(destStation.id)}&limit=1`;
  
  const response = await fetch(connectionsUrl);
  if (!response.ok) {
    console.error("[TravelTime] Transport API connections error:", response.status);
    throw new Error("Keine Verbindung gefunden");
  }

  const data = await response.json();
  const connection = data.connections?.[0];

  if (!connection) {
    throw new Error("Keine Verbindung gefunden");
  }

  const durationSeconds = parseTransportApiDuration(connection.duration || "00d00:00:00");

  return {
    mode: "transit",
    durationSeconds,
    durationMinutes: Math.round(durationSeconds / 60),
    provider: "transport.opendata.ch",
    originStation: originStation.name,
    destStation: destStation.name,
  };
}

/**
 * GET /api/travel-time
 * Query params:
 * - fromLat, fromLng: origin coordinates
 * - toLat, toLng: destination coordinates
 * - mode: "driving" | "transit"
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const fromLat = parseFloat(searchParams.get("fromLat") || "");
  const fromLng = parseFloat(searchParams.get("fromLng") || "");
  const toLat = parseFloat(searchParams.get("toLat") || "");
  const toLng = parseFloat(searchParams.get("toLng") || "");
  const mode = searchParams.get("mode") as "driving" | "transit";

  // Validate params
  if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
    return respondError("Invalid coordinates", 400);
  }

  if (mode !== "driving" && mode !== "transit") {
    return respondError("Invalid mode. Use 'driving' or 'transit'", 400);
  }

  // Check cache
  const cacheKey = `${mode}:${fromLat.toFixed(4)},${fromLng.toFixed(4)}-${toLat.toFixed(4)},${toLng.toFixed(4)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return respondSuccess({ ...cached.data, cached: true });
  }

  try {
    let result: TravelTimeResult;

    if (mode === "driving") {
      result = await getDrivingTime(fromLat, fromLng, toLat, toLng);
    } else {
      result = await getTransitTime(fromLat, fromLng, toLat, toLng);
    }

    // Cache result
    cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });

    return respondSuccess(result);
  } catch (err) {
    console.error("[TravelTime] Error:", err);
    return respondError(
      err instanceof Error ? err.message : "Reisezeit konnte nicht berechnet werden",
      500
    );
  }
}
