/**
 * WhatsApp Webhook Service
 * Processes incoming webhook events from Meta
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  WebhookPayload,
  WebhookMessage,
  WebhookStatus,
  WebhookContact,
  getMediaContent,
  mapMessageType,
  isTextMessage,
} from "./webhook-types";
import { getMediaInfo, downloadMedia } from "./client";
import type { WhatsAppMessageType } from "@/lib/types";

/**
 * Process the entire webhook payload
 */
export async function processWebhookPayload(payload: WebhookPayload): Promise<void> {
  const supabase = createAdminClient();

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { value } = change;
      const phoneNumberId = value.metadata.phone_number_id;

      // Get or create account reference
      const account = await getOrCreateAccount(supabase, phoneNumberId, entry.id);
      if (!account) {
        console.error(`[WhatsApp] No account found for phone_number_id: ${phoneNumberId}`);
        continue;
      }

      // Process messages
      if (value.messages && value.contacts) {
        for (const message of value.messages) {
          const contact = value.contacts.find((c) => c.wa_id === message.from);
          await processInboundMessage(supabase, account.id, message, contact);
        }
      }

      // Process status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await processStatusUpdate(supabase, status);
        }
      }

      // Log errors
      if (value.errors) {
        for (const error of value.errors) {
          console.error(`[WhatsApp] Webhook error: ${error.code} - ${error.title}: ${error.message}`);
        }
      }
    }
  }
}

/**
 * Get or create a WhatsApp account record
 */
async function getOrCreateAccount(
  supabase: ReturnType<typeof createAdminClient>,
  phoneNumberId: string,
  wabaId: string
) {
  // First try to find existing account
  const { data: existing } = await supabase
    .from("whatsapp_accounts")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .single();

  if (existing) return existing;

  // Create a placeholder account (admin should configure properly)
  const { data: created, error } = await supabase
    .from("whatsapp_accounts")
    .insert({
      name: "Auto-created",
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      phone_number: "", // Will be set later
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("[WhatsApp] Failed to create account:", error);
    return null;
  }

  return created;
}

/**
 * Process an inbound message
 */
async function processInboundMessage(
  supabase: ReturnType<typeof createAdminClient>,
  accountId: string,
  message: WebhookMessage,
  contact?: WebhookContact
): Promise<void> {
  const waId = message.from;
  const profileName = contact?.profile?.name || null;

  // Check for idempotency - if message already exists, skip
  const { data: existingMessage } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("wamid", message.id)
    .single();

  if (existingMessage) {
    console.log(`[WhatsApp] Message ${message.id} already processed, skipping`);
    return;
  }

  // Get or create conversation
  const conversation = await getOrCreateConversation(
    supabase,
    accountId,
    waId,
    profileName
  );

  if (!conversation) {
    console.error(`[WhatsApp] Failed to create conversation for ${waId}`);
    return;
  }

  // Extract message content
  let body: string | null = null;
  if (isTextMessage(message)) {
    body = message.text.body;
  } else if (message.type === "interactive" && message.interactive) {
    // Button or list reply
    body = message.interactive.button_reply?.title || message.interactive.list_reply?.title || null;
  } else if (message.type === "button" && message.button) {
    body = message.button.text;
  } else if (message.type === "reaction" && message.reaction) {
    body = message.reaction.emoji;
  } else if (message.type === "location" && message.location) {
    body = `📍 ${message.location.name || message.location.address || `${message.location.latitude}, ${message.location.longitude}`}`;
  }

  // Get media caption if available
  const mediaContent = getMediaContent(message);
  if (mediaContent?.caption) {
    body = mediaContent.caption;
  }

  // Insert message
  const { data: insertedMessage, error: msgError } = await supabase
    .from("whatsapp_messages")
    .insert({
      conversation_id: conversation.id,
      wamid: message.id,
      direction: "inbound",
      message_type: mapMessageType(message.type) as WhatsAppMessageType,
      status: "delivered",
      body,
      sent_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
      delivered_at: new Date().toISOString(),
      raw_payload: message,
    })
    .select()
    .single();

  if (msgError) {
    console.error("[WhatsApp] Failed to insert message:", msgError);
    return;
  }

  // Process media if present
  if (mediaContent) {
    await processMediaAttachment(supabase, insertedMessage.id, message, mediaContent);
  }

  console.log(`[WhatsApp] Processed inbound message ${message.id} from ${waId}`);
}

/**
 * Get or create a conversation
 */
async function getOrCreateConversation(
  supabase: ReturnType<typeof createAdminClient>,
  accountId: string,
  waId: string,
  profileName: string | null
) {
  // Format phone number with +
  const phoneNumber = `+${waId}`;

  // Try to find existing conversation
  const { data: existing } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("account_id", accountId)
    .eq("wa_id", waId)
    .single();

  if (existing) {
    // Update profile name if we got a new one
    if (profileName && profileName !== existing.profile_name) {
      await supabase
        .from("whatsapp_conversations")
        .update({ profile_name: profileName })
        .eq("id", existing.id);
    }
    return existing;
  }

  // Try to auto-link to TMA candidate by phone number
  let linkedTmaId: string | null = null;
  const { data: tmaMatch } = await supabase
    .from("tma_candidates")
    .select("id")
    .or(`phone.eq.${phoneNumber},phone.eq.${waId},phone.eq.0${waId.slice(2)}`)
    .limit(1)
    .single();

  if (tmaMatch) {
    linkedTmaId = tmaMatch.id;
  }

  // Create new conversation
  const { data: created, error } = await supabase
    .from("whatsapp_conversations")
    .insert({
      account_id: accountId,
      wa_id: waId,
      phone_number: phoneNumber,
      profile_name: profileName,
      linked_tma_id: linkedTmaId,
      is_unread: true,
      unread_count: 0,
      last_customer_message_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[WhatsApp] Failed to create conversation:", error);
    return null;
  }

  return created;
}

/**
 * Process a media attachment
 */
async function processMediaAttachment(
  supabase: ReturnType<typeof createAdminClient>,
  messageId: string,
  message: WebhookMessage,
  mediaContent: { id: string; mime_type: string; sha256: string; caption?: string }
): Promise<void> {
  try {
    // Get media info from WhatsApp
    const mediaInfo = await getMediaInfo(mediaContent.id);

    // Download media
    const { arrayBuffer, contentType } = await downloadMedia(mediaInfo.url);

    // Generate filename
    const extension = getExtensionFromMimeType(mediaContent.mime_type);
    const filename = (message.type === "document" && (message.document as { filename?: string })?.filename) ||
      `${mediaContent.id}.${extension}`;

    // Upload to Supabase Storage
    const storagePath = `whatsapp-media/${messageId}/${filename}`;
    // Convert ArrayBuffer to Uint8Array for Supabase
    const uint8Array = new Uint8Array(arrayBuffer);
    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(storagePath, uint8Array, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[WhatsApp] Failed to upload media:", uploadError);
      // Still save media record without storage
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("whatsapp-media")
      .getPublicUrl(storagePath);

    // Insert media record
    await supabase.from("whatsapp_media").insert({
      message_id: messageId,
      wa_media_id: mediaContent.id,
      mime_type: mediaContent.mime_type,
      file_name: filename,
      file_size: parseInt(mediaInfo.file_size) || null,
      sha256: mediaContent.sha256,
      storage_path: uploadError ? null : storagePath,
      storage_url: uploadError ? null : urlData.publicUrl,
      caption: mediaContent.caption || null,
    });

    console.log(`[WhatsApp] Processed media attachment for message ${messageId}`);
  } catch (error) {
    console.error("[WhatsApp] Failed to process media:", error);
    // Don't throw - message was already saved, media is optional
  }
}

/**
 * Process a status update
 */
async function processStatusUpdate(
  supabase: ReturnType<typeof createAdminClient>,
  status: WebhookStatus
): Promise<void> {
  const timestamp = new Date(parseInt(status.timestamp) * 1000).toISOString();

  const updates: Record<string, unknown> = {
    status: status.status,
  };

  switch (status.status) {
    case "sent":
      updates.sent_at = timestamp;
      break;
    case "delivered":
      updates.delivered_at = timestamp;
      break;
    case "read":
      updates.read_at = timestamp;
      break;
    case "failed":
      updates.failed_at = timestamp;
      if (status.errors && status.errors.length > 0) {
        updates.error_code = String(status.errors[0].code);
        updates.error_message = status.errors[0].message || status.errors[0].title;
      }
      break;
  }

  const { error } = await supabase
    .from("whatsapp_messages")
    .update(updates)
    .eq("wamid", status.id);

  if (error) {
    // This can happen for messages we didn't track - not necessarily an error
    console.log(`[WhatsApp] Status update for unknown message ${status.id}: ${status.status}`);
  } else {
    console.log(`[WhatsApp] Updated message ${status.id} to status: ${status.status}`);
  }
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mapping: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/amr": "amr",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "application/pdf": "pdf",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
  };
  return mapping[mimeType] || "bin";
}

/**
 * Verify webhook signature (for security)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  const crypto = require("crypto");
  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");

  return `sha256=${expectedSignature}` === signature;
}







