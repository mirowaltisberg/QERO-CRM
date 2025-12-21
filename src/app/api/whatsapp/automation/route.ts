/**
 * WhatsApp Automation API
 * POST: Trigger automation actions (follow-up reminders, document requests)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendFollowUpReminder,
  sendDocumentRequest,
} from "@/lib/whatsapp/automation-service";

interface AutomationRequest {
  action: "followup_reminder" | "document_request";
  tma_id: string;
  document_type?: "cv" | "references" | "ahv" | "id" | "bank";
  custom_message?: string;
}

/**
 * POST /api/whatsapp/automation
 * Trigger a WhatsApp automation
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: AutomationRequest = await request.json();
    const { action, tma_id, document_type, custom_message } = body;

    if (!action || !tma_id) {
      return NextResponse.json(
        { error: "action and tma_id are required" },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case "followup_reminder":
        result = await sendFollowUpReminder(tma_id, { customMessage: custom_message });
        break;

      case "document_request":
        if (!document_type) {
          return NextResponse.json(
            { error: "document_type is required for document_request action" },
            { status: 400 }
          );
        }
        result = await sendDocumentRequest(tma_id, document_type, { customMessage: custom_message });
        break;

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("[WhatsApp Automation API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}





