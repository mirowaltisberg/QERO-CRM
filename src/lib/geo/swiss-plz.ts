import fs from "node:fs";
import path from "node:path";
import {
  PlzEntry,
  normalizeCityKey,
  normalizeCityName,
  normalizeLocationQuery,
  extractPlz,
} from "./shared";

/**
 * Server-side Swiss PLZ data loader
 */

let cachedPlzData: PlzEntry[] | null = null;
const plzMap = new Map<string, PlzEntry>();
const cityMap = new Map<string, PlzEntry[]>();
let mapsInitialized = false;

function loadPlzData(): PlzEntry[] {
  if (cachedPlzData) return cachedPlzData;

  if (typeof window !== "undefined") {
    throw new Error("swiss-plz.ts is server-only");
  }

  const filePath = path.join(process.cwd(), "public/data/swiss-plz.json");
  const fileContents = fs.readFileSync(filePath, "utf8");
  cachedPlzData = JSON.parse(fileContents);
  return cachedPlzData!;
}

function ensureMaps() {
  if (mapsInitialized) return;
  const data = loadPlzData();
  for (const entry of data) {
    plzMap.set(entry.plz, entry);
    const normalizedCity = normalizeCityKey(entry.name);
    if (!cityMap.has(normalizedCity)) {
      cityMap.set(normalizedCity, []);
    }
    cityMap.get(normalizedCity)!.push(entry);
  }
  mapsInitialized = true;
}

/**
 * Look up coordinates by postal code
 */
export function getCoordsByPlz(plz: string): { lat: number; lng: number } | null {
  ensureMaps();
  const entry = plzMap.get(plz.trim());
  return entry ? { lat: entry.lat, lng: entry.lng } : null;
}

/**
 * Look up coordinates by city name (returns first match)
 */
export function getCoordsByCity(city: string): { lat: number; lng: number; plz: string; name: string } | null {
  ensureMaps();
  const normalizedCity = normalizeCityName(city);
  if (!normalizedCity) return null;
  const entries = cityMap.get(normalizedCity);
  if (entries && entries.length > 0) {
    const first = entries[0];
    return { lat: first.lat, lng: first.lng, plz: first.plz, name: first.name };
  }

  // Fallback to partial match
  const data = loadPlzData();
  const partial = data.find(
    (entry) => normalizeCityKey(entry.name).includes(normalizedCity)
  );
  if (partial) {
    return { lat: partial.lat, lng: partial.lng, plz: partial.plz, name: partial.name };
  }

  return null;
}

/**
 * Search for locations by partial name or PLZ
 */
export function searchLocations(query: string, limit = 10): PlzEntry[] {
  ensureMaps();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalizedCity = normalizeCityName(trimmed);
  const digitsOnly = trimmed.replace(/\D/g, "");

  const results: PlzEntry[] = [];
  const seen = new Set<string>();

  // Exact PLZ match first
  const plzExact = extractPlz(trimmed);
  if (plzExact) {
    const exactPlz = plzMap.get(plzExact);
    if (exactPlz) {
      results.push(exactPlz);
      seen.add(exactPlz.plz);
    }
  }

  const data = loadPlzData();
  for (const entry of data) {
    if (seen.has(entry.plz)) continue;

    const entryCityKey = normalizeCityKey(entry.name);
    const matchesCity =
      normalizedCity && (entryCityKey.includes(normalizedCity) || normalizedCity.includes(entryCityKey));
    const matchesPlzPrefix =
      digitsOnly.length >= 2 && entry.plz.startsWith(digitsOnly.slice(0, Math.min(4, digitsOnly.length)));

    if (matchesCity || matchesPlzPrefix) {
      results.push(entry);
      seen.add(entry.plz);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Get coordinates for a location query (PLZ or city name)
 */
export function geocodeSwissLocation(query: string): { lat: number; lng: number; name: string; plz: string } | null {
  ensureMaps();
  const { plz, city } = normalizeLocationQuery(query);

  if (plz) {
    const plzMatch = plzMap.get(plz);
    if (plzMatch) {
      return { lat: plzMatch.lat, lng: plzMatch.lng, name: plzMatch.name, plz: plzMatch.plz };
    }
  }

  if (city) {
    const cityMatch = getCoordsByCity(city);
    if (cityMatch) {
      return { lat: cityMatch.lat, lng: cityMatch.lng, name: cityMatch.name, plz: cityMatch.plz };
    }
  }

  const partialMatches = searchLocations(query, 1);
  if (partialMatches.length > 0) {
    const match = partialMatches[0];
    return { lat: match.lat, lng: match.lng, name: match.name, plz: match.plz };
  }

  return null;
}

/**
 * Geocode based on candidate postal code or city fields
 */
export function geocodeByPostalOrCity(
  postalCode?: string | null,
  city?: string | null
): { lat: number; lng: number } | null {
  const plz = extractPlz(postalCode ?? "");
  if (plz) {
    const coords = getCoordsByPlz(plz);
    if (coords) return coords;
  }

  const normalizedCity = normalizeCityName(city ?? "");
  if (normalizedCity) {
    const coords = getCoordsByCity(normalizedCity);
    if (coords) {
      return { lat: coords.lat, lng: coords.lng };
    }
  }

  return null;
}

