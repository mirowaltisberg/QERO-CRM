import type { ContactCreateInput } from "@/lib/validation/schemas";

export function sanitizeContactPayload(payload: ContactCreateInput) {
  return {
    company_name: payload.company_name.trim(),
    contact_name: payload.contact_name?.trim() || `${payload.company_name.trim()} Hiring Team`,
    phone: payload.phone ?? null,
    email: payload.email ?? null,
    canton: payload.canton ?? null,
    status: payload.status ?? null,
    follow_up_at: payload.follow_up_at ?? null,
    follow_up_note: payload.follow_up_note ?? null,
    last_call: payload.last_call ?? null,
    notes: payload.notes ?? null,
    team_id: payload.team_id ?? null,
  };
}

