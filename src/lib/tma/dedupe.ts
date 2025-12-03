import type { TmaCreateInput } from "@/lib/validation/schemas";

type CandidateKeyInput = Pick<
  TmaCreateInput,
  "first_name" | "last_name" | "phone" | "postal_code" | "email"
>;

const collapseWhitespace = (value: string) => value.replace(/\s+/g, "");

const normalizeString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

export const normalizeName = (value: string) => value.trim().toLowerCase();

export const normalizeEmail = (value: string | null | undefined) => {
  const trimmed = normalizeString(value);
  return trimmed ? trimmed.toLowerCase() : null;
};

export const normalizePhone = (value: string | null | undefined) => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
};

export const normalizePostalCode = (value: string | null | undefined) => {
  const trimmed = normalizeString(value);
  if (!trimmed) return null;
  const cleaned = collapseWhitespace(trimmed).toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
};

export function deriveTmaImportKeys(candidate: CandidateKeyInput) {
  const normalizedEmail = normalizeEmail(candidate.email);
  const normalizedPhone = normalizePhone(candidate.phone);
  const normalizedPostal = normalizePostalCode(candidate.postal_code);
  const fallback = normalizedPhone ?? normalizedPostal;
  const first = normalizeName(candidate.first_name);
  const last = normalizeName(candidate.last_name);

  const dedupeKey = fallback ? `${first}|${last}|${fallback}` : null;

  return { normalizedEmail, dedupeKey };
}

export function dedupeCandidateRows(rows: TmaCreateInput[]) {
  const seen = new Set<string>();
  const unique: TmaCreateInput[] = [];

  rows.forEach((row, index) => {
    const { normalizedEmail, dedupeKey } = deriveTmaImportKeys(row);
    const baseKey = `${normalizeName(row.first_name)}|${normalizeName(row.last_name)}|${index}`;
    const identityKey = normalizedEmail ?? dedupeKey ?? baseKey;

    if (seen.has(identityKey)) {
      return;
    }

    seen.add(identityKey);
    unique.push(row);
  });

  return unique;
}

