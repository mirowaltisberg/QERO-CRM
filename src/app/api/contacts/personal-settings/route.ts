import { NextRequest } from "next/server";
import { personalSettingsService } from "@/lib/data/personal-settings-service";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.contact_ids)) {
      return respondError("Invalid request: contact_ids array required", 400);
    }

    const { contact_ids } = body;
    const settings = await personalSettingsService.getContactSettings(contact_ids);

    return respondSuccess(settings);
  } catch (error) {
    console.error("POST /api/contacts/personal-settings error:", error);
    return respondError("Failed to fetch personal settings", 500);
  }
}
