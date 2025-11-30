import { NextRequest } from "next/server";
import { contactService } from "@/lib/data/data-service";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ContactCreateSchema } from "@/lib/validation/schemas";
import { sanitizeContactPayload } from "@/lib/utils/sanitize-contact";

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
      const contact = await contactService.create(sanitizeContactPayload(parsed.data));
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

