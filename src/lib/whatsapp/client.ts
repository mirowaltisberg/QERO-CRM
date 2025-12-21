/**
 * WhatsApp Cloud API Client
 * Wrapper for Meta's WhatsApp Business Cloud API
 */

const WHATSAPP_API_VERSION = "v18.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
}

export interface SendTextResult {
  messaging_product: "whatsapp";
  contacts: Array<{ wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface SendTemplateParams {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: TemplateComponent[];
}

export interface TemplateComponent {
  type: "header" | "body" | "button";
  parameters?: Array<{
    type: "text" | "currency" | "date_time" | "image" | "document" | "video";
    text?: string;
    currency?: { fallback_value: string; code: string; amount_1000: number };
    date_time?: { fallback_value: string };
    image?: { link: string };
    document?: { link: string; filename?: string };
    video?: { link: string };
  }>;
  sub_type?: "quick_reply" | "url";
  index?: string;
}

export interface SendMediaParams {
  to: string;
  type: "image" | "document" | "audio" | "video" | "sticker";
  mediaId?: string;
  link?: string;
  caption?: string;
  filename?: string;
}

export interface MediaInfo {
  messaging_product: "whatsapp";
  url: string;
  mime_type: string;
  sha256: string;
  file_size: string;
  id: string;
}

export interface WhatsAppError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

function getConfig(): WhatsAppConfig {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "WhatsApp configuration missing. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN environment variables."
    );
  }

  return { phoneNumberId, accessToken };
}

/**
 * Send a text message
 */
export async function sendText(
  to: string,
  text: string,
  previewUrl = false
): Promise<SendTextResult> {
  const { phoneNumberId, accessToken } = getConfig();

  const response = await fetch(
    `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhoneNumber(to),
        type: "text",
        text: {
          preview_url: previewUrl,
          body: text,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = (await response.json()) as WhatsAppError;
    throw new Error(
      `WhatsApp API error: ${error.error.message} (code: ${error.error.code})`
    );
  }

  return response.json();
}

/**
 * Send a template message
 */
export async function sendTemplate({
  to,
  templateName,
  languageCode = "de",
  components,
}: SendTemplateParams): Promise<SendTextResult> {
  const { phoneNumberId, accessToken } = getConfig();

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhoneNumber(to),
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
    },
  };

  if (components && components.length > 0) {
    (payload.template as Record<string, unknown>).components = components;
  }

  const response = await fetch(
    `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const error = (await response.json()) as WhatsAppError;
    throw new Error(
      `WhatsApp API error: ${error.error.message} (code: ${error.error.code})`
    );
  }

  return response.json();
}

/**
 * Send a media message (image, document, audio, video, sticker)
 */
export async function sendMedia({
  to,
  type,
  mediaId,
  link,
  caption,
  filename,
}: SendMediaParams): Promise<SendTextResult> {
  const { phoneNumberId, accessToken } = getConfig();

  if (!mediaId && !link) {
    throw new Error("Either mediaId or link must be provided");
  }

  const mediaPayload: Record<string, unknown> = {};
  if (mediaId) {
    mediaPayload.id = mediaId;
  } else {
    mediaPayload.link = link;
  }
  if (caption && (type === "image" || type === "document" || type === "video")) {
    mediaPayload.caption = caption;
  }
  if (filename && type === "document") {
    mediaPayload.filename = filename;
  }

  const response = await fetch(
    `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhoneNumber(to),
        type,
        [type]: mediaPayload,
      }),
    }
  );

  if (!response.ok) {
    const error = (await response.json()) as WhatsAppError;
    throw new Error(
      `WhatsApp API error: ${error.error.message} (code: ${error.error.code})`
    );
  }

  return response.json();
}

/**
 * Get media info (URL, mime type, etc.)
 */
export async function getMediaInfo(mediaId: string): Promise<MediaInfo> {
  const { accessToken } = getConfig();

  const response = await fetch(`${WHATSAPP_API_BASE}/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = (await response.json()) as WhatsAppError;
    throw new Error(
      `WhatsApp API error: ${error.error.message} (code: ${error.error.code})`
    );
  }

  return response.json();
}

/**
 * Download media content as an ArrayBuffer
 */
export async function downloadMedia(mediaUrl: string): Promise<{
  arrayBuffer: ArrayBuffer;
  contentType: string;
}> {
  const { accessToken } = getConfig();

  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();

  return { arrayBuffer, contentType };
}

/**
 * Upload media to WhatsApp servers
 */
export async function uploadMedia(
  fileBlob: Blob,
  mimeType: string,
  filename: string
): Promise<{ id: string }> {
  const { phoneNumberId, accessToken } = getConfig();

  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("file", fileBlob, filename);
  formData.append("type", mimeType);

  const response = await fetch(
    `${WHATSAPP_API_BASE}/${phoneNumberId}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = (await response.json()) as WhatsAppError;
    throw new Error(
      `WhatsApp API error: ${error.error.message} (code: ${error.error.code})`
    );
  }

  return response.json();
}

/**
 * Mark a message as read
 */
export async function markAsRead(messageId: string): Promise<boolean> {
  const { phoneNumberId, accessToken } = getConfig();

  const response = await fetch(
    `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    }
  );

  if (!response.ok) {
    console.error("Failed to mark message as read:", await response.text());
    return false;
  }

  const result = await response.json();
  return result.success === true;
}

/**
 * Normalize phone number to WhatsApp format
 * Removes +, spaces, dashes and ensures it starts with country code
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, "");

  // If starts with 0, assume Swiss number and add 41
  if (normalized.startsWith("0")) {
    normalized = "41" + normalized.slice(1);
  }

  return normalized;
}

/**
 * Check if we're within the 24-hour customer-care window
 */
export function isWithinMessageWindow(lastCustomerMessageAt: Date | null): boolean {
  if (!lastCustomerMessageAt) return false;
  const now = new Date();
  const windowMs = 24 * 60 * 60 * 1000; // 24 hours
  return now.getTime() - lastCustomerMessageAt.getTime() < windowMs;
}





