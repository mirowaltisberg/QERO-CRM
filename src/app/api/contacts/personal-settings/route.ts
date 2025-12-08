import { NextRequest } from "next/server";
import { serverPersonalSettingsService } from "@/lib/data/personal-settings-service-server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.contact_ids)) {
      return respondError("Invalid request: contact_ids array required", 400);
    }

    const { contact_ids } = body;
    console.log("[API Personal Settings] Fetching for", contact_ids.length, "contacts");
    
    // Use server personal settings service (has proper auth context)
    const settings = await serverPersonalSettingsService.getContactSettings(contact_ids);
    
    const settingsCount = Object.keys(settings).length;
    console.log("[API Personal Settings] Returning", settingsCount, "settings");
    
    if (settingsCount > 0) {
      // Log a sample for debugging
      const sampleKey = Object.keys(settings)[0];
      console.log("[API Personal Settings] Sample setting:", {
        contactId: sampleKey,
        status: settings[sampleKey]?.status,
        follow_up_at: settings[sampleKey]?.follow_up_at,
      });
    }

    return respondSuccess(settings);
  } catch (error) {
    console.error("POST /api/contacts/personal-settings error:", error);
    return respondError("Failed to fetch personal settings", 500);
  }
}
