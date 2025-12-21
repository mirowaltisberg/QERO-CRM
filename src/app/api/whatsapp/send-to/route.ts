/**
 * WhatsApp Quick Send API
 * POST: Send a message directly to a phone number (creates conversation if needed)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendText,
  sendTemplate,
  sendMedia,
  normalizePhoneNumber,
  type TemplateComponent,
} from "@/lib/whatsapp/client";
import type { WhatsAppMessageType } from "@/lib/types";

interface SendToRequest {
  phone_number: string;
  linked_tma_id?: string;
  linked_contact_id?: string;
  message:
    | { type: "text"; text: string }
    | { type: "template"; template_name: string; language_code?: string; components?: TemplateComponent[] }
    | { type: "media"; media_type: "image" | "document" | "audio" | "video"; media_url?: string; media_id?: string; caption?: string; filename?: string };
}

/**
 * POST /api/whatsapp/send-to
 * Send a WhatsApp message to a phone number
 * Creates conversation automatically if it doesn't exist
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: SendToRequest = await request.json();
    const { phone_number, linked_tma_id, linked_contact_id, message } = body;

    if (!phone_number) {
      return NextResponse.json({ error: "phone_number is required" }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Normalize phone number
    const waId = normalizePhoneNumber(phone_number);
    const formattedPhone = `+${waId}`;

    // Get the active WhatsApp account
    const { data: account, error: accountError } = await supabase
      .from("whatsapp_accounts")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: "No active WhatsApp account configured" }, { status: 400 });
    }

    // Get or create conversation
    let conversation;
    const { data: existing } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("account_id", account.id)
      .eq("wa_id", waId)
      .single();

    if (existing) {
      conversation = existing;
      // Update linkage if provided
      if (linked_tma_id || linked_contact_id) {
        await supabase
          .from("whatsapp_conversations")
          .update({
            linked_tma_id: linked_tma_id || existing.linked_tma_id,
            linked_contact_id: linked_contact_id || existing.linked_contact_id,
          })
          .eq("id", existing.id);
      }
    } else {
      // Create new conversation
      const { data: created, error: createError } = await supabase
        .from("whatsapp_conversations")
        .insert({
          account_id: account.id,
          wa_id: waId,
          phone_number: formattedPhone,
          linked_tma_id,
          linked_contact_id,
          assigned_to: user.id,
          is_unread: false,
          unread_count: 0,
        })
        .select()
        .single();

      if (createError) {
        console.error("[WhatsApp API] Error creating conversation:", createError);
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
      conversation = created;
    }

    // Send message
    let result;
    let messageType: WhatsAppMessageType = "text";
    let messageBody: string | null = null;
    let templateName: string | null = null;
    let templateParams: Record<string, unknown> | null = null;

    try {
      switch (message.type) {
        case "text":
          if (!message.text) {
            return NextResponse.json({ error: "text is required for text message" }, { status: 400 });
          }
          result = await sendText(formattedPhone, message.text);
          messageBody = message.text;
          break;

        case "template":
          if (!message.template_name) {
            return NextResponse.json({ error: "template_name is required for template message" }, { status: 400 });
          }
          result = await sendTemplate({
            to: formattedPhone,
            templateName: message.template_name,
            languageCode: message.language_code,
            components: message.components,
          });
          messageType = "template";
          templateName = message.template_name;
          templateParams = message.components as unknown as Record<string, unknown> | null;
          break;

        case "media":
          if (!message.media_type || (!message.media_url && !message.media_id)) {
            return NextResponse.json(
              { error: "media_type and either media_url or media_id are required for media message" },
              { status: 400 }
            );
          }
          result = await sendMedia({
            to: formattedPhone,
            type: message.media_type,
            mediaId: message.media_id,
            link: message.media_url,
            caption: message.caption,
            filename: message.filename,
          });
          messageType = message.media_type as WhatsAppMessageType;
          messageBody = message.caption || null;
          break;

        default:
          return NextResponse.json({ error: "Invalid message type" }, { status: 400 });
      }
    } catch (sendError) {
      console.error("[WhatsApp Send] API error:", sendError);
      
      // Store failed message attempt
      await supabase.from("whatsapp_messages").insert({
        conversation_id: conversation.id,
        direction: "outbound",
        message_type: messageType,
        status: "failed",
        body: messageBody,
        template_name: templateName,
        template_params: templateParams,
        sender_id: user.id,
        failed_at: new Date().toISOString(),
        error_message: sendError instanceof Error ? sendError.message : "Unknown error",
      });

      return NextResponse.json(
        { error: sendError instanceof Error ? sendError.message : "Failed to send message" },
        { status: 500 }
      );
    }

    // Store sent message
    const wamid = result.messages?.[0]?.id;
    const { data: storedMessage, error: msgError } = await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: conversation.id,
        wamid,
        direction: "outbound",
        message_type: messageType,
        status: "sent",
        body: messageBody,
        template_name: templateName,
        template_params: templateParams,
        sender_id: user.id,
        sent_at: new Date().toISOString(),
      })
      .select(`
        *,
        sender:profiles!whatsapp_messages_sender_id_fkey(id, full_name, avatar_url)
      `)
      .single();

    if (msgError) {
      console.error("[WhatsApp Send] Error storing message:", msgError);
    }

    return NextResponse.json({
      success: true,
      message_id: wamid,
      conversation_id: conversation.id,
      data: storedMessage,
    });
  } catch (error) {
    console.error("[WhatsApp Send] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}





