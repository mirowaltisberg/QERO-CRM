/**
 * WhatsApp Automation Service
 * Handles automated messaging for follow-ups, document requests, etc.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplate, isWithinMessageWindow, normalizePhoneNumber } from "./client";
import type { TemplateComponent } from "./client";

/**
 * Send a follow-up reminder to a TMA candidate
 */
export async function sendFollowUpReminder(
  tmaId: string,
  options: {
    customMessage?: string;
  } = {}
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const supabase = createAdminClient();

  // Get TMA candidate with follow-up info
  const { data: tma, error: tmaError } = await supabase
    .from("tma_candidates")
    .select("id, first_name, last_name, phone, follow_up_at, follow_up_note")
    .eq("id", tmaId)
    .single();

  if (tmaError || !tma) {
    return { success: false, error: "TMA candidate not found" };
  }

  if (!tma.phone) {
    return { success: false, error: "TMA candidate has no phone number" };
  }

  // Normalize phone number
  const waId = normalizePhoneNumber(tma.phone);
  const formattedPhone = `+${waId}`;

  // Get or check conversation for 24h window
  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("wa_id", waId)
    .single();

  const lastCustomerMessage = conversation?.last_customer_message_at
    ? new Date(conversation.last_customer_message_at)
    : null;
  const withinWindow = isWithinMessageWindow(lastCustomerMessage);

  // Format follow-up date
  const followUpDate = tma.follow_up_at
    ? new Date(tma.follow_up_at).toLocaleDateString("de-CH", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "heute";

  try {
    // Build template parameters
    const components: TemplateComponent[] = [
      {
        type: "body",
        parameters: [
          { type: "text", text: `${tma.first_name} ${tma.last_name}` },
          { type: "text", text: followUpDate },
          { type: "text", text: tma.follow_up_note || "Rücksprache" },
        ],
      },
    ];

    // Send template (works even outside 24h window)
    const result = await sendTemplate({
      to: formattedPhone,
      templateName: "followup_reminder_de",
      languageCode: "de",
      components,
    });

    // Store the message
    const messageId = result.messages?.[0]?.id;

    // Create or get conversation
    let convId = conversation?.id;
    if (!convId) {
      const { data: account } = await supabase
        .from("whatsapp_accounts")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (account) {
        const { data: newConv } = await supabase
          .from("whatsapp_conversations")
          .insert({
            account_id: account.id,
            wa_id: waId,
            phone_number: formattedPhone,
            linked_tma_id: tmaId,
          })
          .select()
          .single();
        convId = newConv?.id;
      }
    }

    if (convId) {
      await supabase.from("whatsapp_messages").insert({
        conversation_id: convId,
        wamid: messageId,
        direction: "outbound",
        message_type: "template",
        status: "sent",
        template_name: "followup_reminder_de",
        template_params: { candidate: `${tma.first_name} ${tma.last_name}`, date: followUpDate },
        sent_at: new Date().toISOString(),
      });
    }

    console.log(`[WhatsApp Automation] Sent follow-up reminder to ${tma.first_name} ${tma.last_name}`);
    return { success: true, messageId };
  } catch (err) {
    console.error("[WhatsApp Automation] Failed to send follow-up reminder:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Send a document request to a TMA candidate
 */
export async function sendDocumentRequest(
  tmaId: string,
  documentType: "cv" | "references" | "ahv" | "id" | "bank",
  options: {
    customMessage?: string;
  } = {}
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const supabase = createAdminClient();

  // Get TMA candidate
  const { data: tma, error: tmaError } = await supabase
    .from("tma_candidates")
    .select("id, first_name, last_name, phone")
    .eq("id", tmaId)
    .single();

  if (tmaError || !tma) {
    return { success: false, error: "TMA candidate not found" };
  }

  if (!tma.phone) {
    return { success: false, error: "TMA candidate has no phone number" };
  }

  // Document type labels (German)
  const documentLabels: Record<string, string> = {
    cv: "Lebenslauf",
    references: "Arbeitszeugnisse",
    ahv: "AHV-Ausweis",
    id: "Personalausweis oder Pass",
    bank: "Bankkarte (für Lohnzahlung)",
  };

  const documentLabel = documentLabels[documentType] || documentType;

  // Normalize phone number
  const waId = normalizePhoneNumber(tma.phone);
  const formattedPhone = `+${waId}`;

  try {
    // Build template parameters
    const components: TemplateComponent[] = [
      {
        type: "body",
        parameters: [
          { type: "text", text: tma.first_name },
          { type: "text", text: documentLabel },
        ],
      },
    ];

    // Send template
    const result = await sendTemplate({
      to: formattedPhone,
      templateName: "document_request_de",
      languageCode: "de",
      components,
    });

    // Store the message
    const messageId = result.messages?.[0]?.id;

    // Get or create conversation
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("wa_id", waId)
      .single();

    let convId = conversation?.id;
    if (!convId) {
      const { data: account } = await supabase
        .from("whatsapp_accounts")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (account) {
        const { data: newConv } = await supabase
          .from("whatsapp_conversations")
          .insert({
            account_id: account.id,
            wa_id: waId,
            phone_number: formattedPhone,
            linked_tma_id: tmaId,
          })
          .select()
          .single();
        convId = newConv?.id;
      }
    }

    if (convId) {
      await supabase.from("whatsapp_messages").insert({
        conversation_id: convId,
        wamid: messageId,
        direction: "outbound",
        message_type: "template",
        status: "sent",
        template_name: "document_request_de",
        template_params: { firstName: tma.first_name, documentType: documentLabel },
        sent_at: new Date().toISOString(),
      });
    }

    console.log(`[WhatsApp Automation] Sent document request (${documentType}) to ${tma.first_name} ${tma.last_name}`);
    return { success: true, messageId };
  } catch (err) {
    console.error("[WhatsApp Automation] Failed to send document request:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Process due follow-ups and send reminders
 * This should be called by a cron job or scheduled function
 */
export async function processDueFollowUps(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}> {
  const supabase = createAdminClient();
  const now = new Date();
  const errors: string[] = [];
  let processed = 0;
  let sent = 0;
  let failed = 0;

  // Get TMA candidates with due follow-ups (within the last hour or overdue)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const { data: tmaCandidates, error } = await supabase
    .from("tma_candidates")
    .select("id, first_name, last_name, phone, follow_up_at, follow_up_note")
    .gte("follow_up_at", oneHourAgo.toISOString())
    .lte("follow_up_at", now.toISOString())
    .not("phone", "is", null);

  if (error) {
    console.error("[WhatsApp Automation] Failed to fetch due follow-ups:", error);
    return { processed: 0, sent: 0, failed: 0, errors: [error.message] };
  }

  for (const tma of tmaCandidates || []) {
    processed++;

    const result = await sendFollowUpReminder(tma.id);

    if (result.success) {
      sent++;
    } else {
      failed++;
      errors.push(`${tma.first_name} ${tma.last_name}: ${result.error}`);
    }

    // Rate limit: wait 1 second between messages
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`[WhatsApp Automation] Processed ${processed} follow-ups: ${sent} sent, ${failed} failed`);
  return { processed, sent, failed, errors };
}





