import type { ContactCreateInput } from "@/lib/validation/schemas";
import { fixEncodingString } from "./fix-encoding";

/**
 * Sanitize and normalize contact payload before saving to database.
 * - Trims whitespace
 * - Fixes UTF-8 mojibake (e.g., Ã¤ → ä) from Outlook imports
 * - Sets defaults for required fields
 */
export function sanitizeContactPayload(payload: ContactCreateInput) {
  // Fix encoding issues in text fields
  const fixedCompanyName = fixEncodingString(payload.company_name.trim()) || payload.company_name.trim();
  const fixedContactName = payload.contact_name 
    ? (fixEncodingString(payload.contact_name.trim()) || payload.contact_name.trim())
    : `${fixedCompanyName} Hiring Team`;
  const fixedCity = payload.city ? (fixEncodingString(payload.city.trim()) || payload.city.trim()) : null;
  const fixedStreet = payload.street ? (fixEncodingString(payload.street.trim()) || payload.street.trim()) : null;
  const fixedNotes = payload.notes ? (fixEncodingString(payload.notes) || payload.notes) : null;

  return {
    company_name: fixedCompanyName,
    contact_name: fixedContactName,
    phone: payload.phone ?? null,
    email: payload.email ?? null,
    canton: payload.canton ?? null,
    city: fixedCity,
    street: fixedStreet,
    postal_code: payload.postal_code ?? null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    status: payload.status ?? null,
    follow_up_at: payload.follow_up_at ?? null,
    follow_up_note: payload.follow_up_note ?? null,
    last_call: payload.last_call ?? null,
    notes: fixedNotes,
    team_id: payload.team_id ?? null,
  };
}

