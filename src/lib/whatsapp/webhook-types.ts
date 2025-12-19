/**
 * WhatsApp Cloud API Webhook Types
 * Based on Meta's webhook payload structure
 */

export interface WebhookPayload {
  object: "whatsapp_business_account";
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string; // WABA ID
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: WebhookValue;
  field: "messages";
}

export interface WebhookValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WebhookContact[];
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
  errors?: WebhookError[];
}

export interface WebhookContact {
  profile: {
    name: string;
  };
  wa_id: string; // Phone number in WhatsApp format
}

export interface WebhookMessage {
  from: string; // Sender's phone number
  id: string; // Message ID (wamid)
  timestamp: string; // Unix timestamp
  type: MessageType;
  // Content based on type
  text?: { body: string };
  image?: MediaContent;
  document?: MediaContent & { filename?: string };
  audio?: MediaContent;
  video?: MediaContent;
  sticker?: MediaContent;
  location?: LocationContent;
  contacts?: ContactContent[];
  interactive?: InteractiveContent;
  button?: ButtonContent;
  reaction?: ReactionContent;
  // Context (if replying to a message)
  context?: {
    from: string;
    id: string;
  };
  // Referral (from click-to-whatsapp ads)
  referral?: {
    source_url: string;
    source_type: string;
    source_id: string;
    headline: string;
    body: string;
    media_type: string;
    image_url?: string;
    video_url?: string;
    thumbnail_url?: string;
  };
}

export type MessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "button"
  | "reaction"
  | "order"
  | "system"
  | "unknown";

export interface MediaContent {
  id: string; // Media ID for downloading
  mime_type: string;
  sha256: string;
  caption?: string;
}

export interface LocationContent {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface ContactContent {
  name: {
    formatted_name: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    suffix?: string;
    prefix?: string;
  };
  phones?: Array<{
    phone: string;
    type: string;
    wa_id?: string;
  }>;
  emails?: Array<{
    email: string;
    type: string;
  }>;
}

export interface InteractiveContent {
  type: "button_reply" | "list_reply";
  button_reply?: {
    id: string;
    title: string;
  };
  list_reply?: {
    id: string;
    title: string;
    description?: string;
  };
}

export interface ButtonContent {
  payload: string;
  text: string;
}

export interface ReactionContent {
  message_id: string; // ID of the message being reacted to
  emoji: string;
}

export interface WebhookStatus {
  id: string; // Message ID
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin?: {
      type: "business_initiated" | "user_initiated" | "referral_conversion";
    };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: WebhookError[];
}

export interface WebhookError {
  code: number;
  title: string;
  message?: string;
  error_data?: {
    details: string;
  };
}

/**
 * Type guards for webhook processing
 */

export function isTextMessage(msg: WebhookMessage): msg is WebhookMessage & { text: { body: string } } {
  return msg.type === "text" && !!msg.text;
}

export function isMediaMessage(msg: WebhookMessage): boolean {
  return ["image", "document", "audio", "video", "sticker"].includes(msg.type);
}

export function getMediaContent(msg: WebhookMessage): MediaContent | null {
  switch (msg.type) {
    case "image":
      return msg.image || null;
    case "document":
      return msg.document || null;
    case "audio":
      return msg.audio || null;
    case "video":
      return msg.video || null;
    case "sticker":
      return msg.sticker || null;
    default:
      return null;
  }
}

/**
 * Map webhook message type to our database enum
 */
export function mapMessageType(type: MessageType): string {
  const mapping: Record<MessageType, string> = {
    text: "text",
    image: "image",
    document: "document",
    audio: "audio",
    video: "video",
    sticker: "sticker",
    location: "location",
    contacts: "contacts",
    interactive: "interactive",
    button: "interactive",
    reaction: "reaction",
    order: "unknown",
    system: "unknown",
    unknown: "unknown",
  };
  return mapping[type] || "unknown";
}




