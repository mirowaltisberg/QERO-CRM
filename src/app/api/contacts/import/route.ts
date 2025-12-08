import { NextRequest } from "next/server";
import { serverContactService } from "@/lib/data/server-data-service";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ContactCreateSchema } from "@/lib/validation/schemas";
import { sanitizeContactPayload } from "@/lib/utils/sanitize-contact";
import { geocodeByPostalOrCity } from "@/lib/geo";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.contacts)) {
      return respondError("contacts array is required", 400);
    }

    const created: string[] = [];
    const errors: string[] = [];

    for (const [index, raw] of body.contacts.entries()) {
      const parsed = ContactCreateSchema.safeParse(raw);
      if (!parsed.success) {
        errors.push(`Row ${index + 1}: ${parsed.error.issues[0]?.message ?? "invalid data"}`);
        continue;
      }
      
      // Geocode address if postal_code or city is provided
      const payload = sanitizeContactPayload(parsed.data);
      if ((payload.postal_code || payload.city) && !payload.latitude) {
        const coords = geocodeByPostalOrCity(payload.postal_code, payload.city);
        if (coords) {
          payload.latitude = coords.lat;
          payload.longitude = coords.lng;
        }
      }
      
      // Use server contact service (uses server-side auth)
      const contact = await serverContactService.create(payload);
      created.push(contact.id);
    }

    return respondSuccess(
      {
        created,
        errors,
      },
      { status: errors.length ? 207 : 201 }
    );
  } catch (error) {
    console.error("POST /api/contacts/import error", error);
    return respondError("Failed to import contacts", 500);
  }
}

