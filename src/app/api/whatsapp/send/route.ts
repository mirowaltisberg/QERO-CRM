/**
 * WhatsApp Send Message API
 * POST: Send a message (text, template, or media)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendText,
  sendTemplate,
  sendMedia,
  isWithinMessageWindow,
  type TemplateComponent,
} from "@/lib/whatsapp/client";
import type { WhatsAppMessageType } from "@/lib/types";

interface SendTextRequest {
  type: "text";
  conversation_id: string;
  text: string;
}

interface SendTemplateRequest {
  type: "template";
  conversation_id: string;
  template_name: string;
  language_code?: string;
  components?: TemplateComponent[];
}

interface SendMediaRequest {
  type: "media";
  conversation_id: string;
  media_type: "image" | "document" | "audio" | "video";
  media_url?: string;
  media_id?: string;
  caption?: string;
  filename?: string;
}

type SendRequest = SendTextRequest | SendTemplateRequest | SendMediaRequest;

/**
 * POST /api/whatsapp/send
 * Send a WhatsApp message
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: SendRequest = await request.json();
    const { conversation_id } = body;

    if (!conversation_id) {
      return NextResponse.json({ error: "conversation_id is required" }, { status: 400 });
    }

    // Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Check 24-hour window for non-template messages
    const lastCustomerMessage = conversation.last_customer_message_at
      ? new Date(conversation.last_customer_message_at)
      : null;
    const withinWindow = isWithinMessageWindow(lastCustomerMessage);

    if (body.type !== "template" && !withinWindow) {
      return NextResponse.json(
        {
          error: "Outside 24-hour window. Use a template message to re-initiate conversation.",
          code: "OUTSIDE_WINDOW",
        },
        { status: 400 }
      );
    }

    let result;
    let messageType: WhatsAppMessageType = "text";
    let messageBody: string | null = null;
    let templateName: string | null = null;
    let templateParams: Record<string, unknown> | null = null;

    try {
      switch (body.type) {
        case "text":
          if (!body.text) {
            return NextResponse.json({ error: "text is required" }, { status: 400 });
          }
          result = await sendText(conversation.phone_number, body.text);
          messageBody = body.text;
          break;

        case "template":
          if (!body.template_name) {
            return NextResponse.json({ error: "template_name is required" }, { status: 400 });
          }
          result = await sendTemplate({
            to: conversation.phone_number,
            templateName: body.template_name,
            languageCode: body.language_code,
            components: body.components,
          });
          messageType = "template";
          templateName = body.template_name;
          templateParams = body.components as unknown as Record<string, unknown> | null;
          break;

        case "media":
          if (!body.media_type || (!body.media_url && !body.media_id)) {
            return NextResponse.json(
              { error: "media_type and either media_url or media_id are required" },
              { status: 400 }
            );
          }
          result = await sendMedia({
            to: conversation.phone_number,
            type: body.media_type,
            mediaId: body.media_id,
            link: body.media_url,
            caption: body.caption,
            filename: body.filename,
          });
          messageType = body.media_type as WhatsAppMessageType;
          messageBody = body.caption || null;
          break;

        default:
          return NextResponse.json({ error: "Invalid message type" }, { status: 400 });
      }
    } catch (sendError) {
      console.error("[WhatsApp Send] API error:", sendError);
      
      // Store failed message attempt
      await supabase.from("whatsapp_messages").insert({
        conversation_id,
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
    const { data: message, error: msgError } = await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id,
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
      // Message was sent successfully, just failed to store - don't return error
    }

    return NextResponse.json({
      success: true,
      message_id: wamid,
      data: message,
    });
  } catch (error) {
    console.error("[WhatsApp Send] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}




