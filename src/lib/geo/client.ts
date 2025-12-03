import {
  PlzEntry,
  normalizeCityKey,
  normalizeCityName,
  extractPlz,
} from "./shared";

let dataset: PlzEntry[] | null = null;
let datasetPromise: Promise<PlzEntry[]> | null = null;

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

