import {
  PlzEntry,
  normalizeCityKey,
  normalizeCityName,
  extractPlz,
} from "./shared";

let dataset: PlzEntry[] | null = null;
let datasetPromise: Promise<PlzEntry[]> | null = null;

// Common Swiss city names for quick detection
const COMMON_SWISS_CITIES = new Set([
  "zurich", "zürich", "zuerich", "geneva", "genève", "genf", "basel", "bern",
  "lausanne", "winterthur", "luzern", "lucerne", "st. gallen", "st gallen",
  "lugano", "biel", "thun", "köniz", "fribourg", "freiburg", "chur", "schaffhausen",
  "vernier", "uster", "sion", "neuchâtel", "neuchatel", "emmen", "yverdon",
  "zug", "kriens", "rapperswil", "dübendorf", "montreux", "frauenfeld", "dietikon",
  "wettingen", "baden", "aarau", "olten", "solothurn", "bellinzona", "locarno"
]);

/**
 * Check if a query looks like a Swiss location (PLZ or city name)
 */
export function looksLikeSwissLocation(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return false;

  // Check if it starts with digits (PLZ)
  if (/^\d{2,4}/.test(trimmed)) {
    return true;
  }

  // Check if it matches a common city name
  if (COMMON_SWISS_CITIES.has(trimmed)) {
    return true;
  }

  // Check if it starts with a common city prefix
  for (const city of COMMON_SWISS_CITIES) {
    if (city.startsWith(trimmed) && trimmed.length >= 3) {
      return true;
    }
  }

  return false;
}

async function loadDataset(): Promise<PlzEntry[]> {
  if (dataset) return dataset;
  if (!datasetPromise) {
    datasetPromise = fetch("/data/swiss-plz.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load Swiss PLZ dataset");
        }
        return response.json();
      })
      .then((data: PlzEntry[]) => {
        dataset = data;
        datasetPromise = null;
        return data;
      })
      .catch((error) => {
        datasetPromise = null;
        throw error;
      });
  }
  return datasetPromise;
}

export async function searchLocationsClient(query: string, limit = 10): Promise<PlzEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const data = await loadDataset();

  const normalizedCity = normalizeCityName(trimmed);
  const digitsOnly = trimmed.replace(/\D/g, "");

  const results: PlzEntry[] = [];
  const seen = new Set<string>();

  const plzExact = extractPlz(trimmed);
  if (plzExact) {
    const exactPlz = data.find((entry) => entry.plz === plzExact);
    if (exactPlz) {
      results.push(exactPlz);
      seen.add(exactPlz.plz);
    }
  }

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

