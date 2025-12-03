export interface PlzEntry {
  plz: string;
  name: string;
  lat: number;
  lng: number;
  canton?: string | null;
}

const PLZ_REGEX = /\d{4}/;

export const stripDiacritics = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeCityKey = (value: string) =>
  stripDiacritics(value)
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/,+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const extractPlz = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(PLZ_REGEX);
  return match ? match[0] : null;
};

export const normalizeCityName = (value?: string | null) => {
  if (!value) return null;
  const normalized = normalizeCityKey(value);
  return normalized || null;
};

export function normalizeLocationQuery(raw: string) {
  return {
    plz: extractPlz(raw),
    city: normalizeCityName(raw),
  };
}

