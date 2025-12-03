/**
 * Microsoft Graph API client for email operations
 */

import { createAdminClient } from "@/lib/supabase/admin";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string | null;
  bodyPreview: string;
  body: {
    contentType: "text" | "html";
    content: string;
  };
  from: {
    emailAddress: {
      address: string;
      name: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      address: string;
      name: string;
    };
  }>;
  ccRecipients: Array<{
    emailAddress: {
      address: string;
      name: string;
    };
  }>;
  bccRecipients: Array<{
    emailAddress: {
      address: string;
      name: string;
    };
  }>;
  isRead: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  sentDateTime: string | null;
  receivedDateTime: string | null;
  parentFolderId: string;
}

interface GraphDeltaResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

interface EmailAccount {
  id: string;
  user_id: string;
  mailbox: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  delta_token: string | null;
}

/**
 * Refresh access token if expired
 */
export async function ensureValidToken(account: EmailAccount): Promise<string> {
  const expiresAt = new Date(account.token_expires_at);
  const now = new Date();
  
  // If token is still valid (with 5 min buffer), return it
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return account.access_token;
  }

  // Refresh the token
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth credentials not configured");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Token refresh failed:", error);
    throw new Error("Failed to refresh access token");
  }

  const tokens = await response.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Update tokens in database
  const adminSupabase = createAdminClient();
  await adminSupabase
    .from("email_accounts")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || account.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return tokens.access_token;
}

/**
 * Fetch messages using delta query for incremental sync
 */
export async function fetchMessagesDelta(
  accessToken: string,
  deltaToken: string | null
): Promise<{ messages: GraphMessage[]; nextDeltaToken: string }> {
  const messages: GraphMessage[] = [];
  
  // Build initial URL - use inbox delta for now
  let url: string;
  if (deltaToken) {
    url = deltaToken;
  } else {
    // Initial sync - get messages from inbox
    url = `${GRAPH_BASE_URL}/me/mailFolders/inbox/messages/delta?$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,isRead,isDraft,hasAttachments,sentDateTime,receivedDateTime,parentFolderId&$top=100`;
  }

  let nextDeltaToken = "";

  // Follow pagination
  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Graph API error:", error);
      throw new Error("Failed to fetch messages from Graph API");
    }

    const data: GraphDeltaResponse = await response.json();
    messages.push(...data.value);

    if (data["@odata.nextLink"]) {
      url = data["@odata.nextLink"];
    } else if (data["@odata.deltaLink"]) {
      nextDeltaToken = data["@odata.deltaLink"];
      break;
    } else {
      break;
    }

    // Safety limit
    if (messages.length > 200) {
      console.warn("Reached message limit during sync");
      break;
    }
  }

  return { messages, nextDeltaToken };
}


/**
 * Fetch messages from a specific folder (non-delta, for sent items etc.)
 */
export async function fetchMessagesFromFolder(
  accessToken: string,
  folder: "sentitems" | "drafts"
): Promise<GraphMessage[]> {
  const messages: GraphMessage[] = [];
  // Only fetch last 50 messages from sent/drafts, no pagination
  const url = `${GRAPH_BASE_URL}/me/mailFolders/${folder}/messages?$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,isRead,isDraft,hasAttachments,sentDateTime,receivedDateTime,parentFolderId&$top=50&$orderby=sentDateTime desc`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Graph API error fetching ${folder}:`, error);
      return []; // Return empty, don't throw
    }

    const data = await response.json();
    return data.value || [];
  } catch (err) {
    console.error(`Error fetching ${folder}:`, err);
    return [];
  }
}

/**
 * Send an email via Graph API
 */
export async function sendEmail(
  accessToken: string,
  to: string[],
  subject: string,
  body: string,
  cc?: string[],
  bcc?: string[],
  replyToMessageId?: string
): Promise<void> {
  const message = {
    subject,
    body: {
      contentType: "HTML",
      content: body,
    },
    toRecipients: to.map((email) => ({
      emailAddress: { address: email },
    })),
    ccRecipients: cc?.map((email) => ({
      emailAddress: { address: email },
    })),
    bccRecipients: bcc?.map((email) => ({
      emailAddress: { address: email },
    })),
  };

  // Use users/{mailbox} for Application permissions
  let url = `${GRAPH_BASE_URL}/me/sendMail`;
  let requestBody: Record<string, unknown> = { message, saveToSentItems: true };

  // If replying, use the reply endpoint
  if (replyToMessageId) {
    url = `${GRAPH_BASE_URL}/me/messages/${replyToMessageId}/reply`;
    requestBody = { message: { body: message.body }, comment: "" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Send email failed:", error);
    throw new Error("Failed to send email");
  }
}

/**
 * Mark message as read/unread
 */
export async function markMessageRead(
  accessToken: string,
  messageId: string,
  isRead: boolean
): Promise<void> {
  const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isRead }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Mark read failed:", error);
    throw new Error("Failed to update message");
  }
}

/**
 * Move message to folder (archive, trash, etc.)
 */
export async function moveMessage(
  accessToken: string,
  messageId: string,
  destinationFolder: "archive" | "deleteditems" | "inbox"
): Promise<void> {
  const folderMap: Record<string, string> = {
    archive: "archive",
    deleteditems: "deleteditems",
    inbox: "inbox",
  };

  const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}/move`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ destinationId: folderMap[destinationFolder] }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Move message failed:", error);
    throw new Error("Failed to move message");
  }
}

/**
 * Map Graph folder ID to our folder type
 */
export function mapFolderIdToType(folderId: string): "inbox" | "sent" | "drafts" | "archive" | "trash" {
  const lowerFolderId = folderId.toLowerCase();
  if (lowerFolderId.includes("sentitems")) return "sent";
  if (lowerFolderId.includes("drafts")) return "drafts";
  if (lowerFolderId.includes("deleteditems")) return "trash";
  if (lowerFolderId.includes("archive")) return "archive";
  return "inbox";
}

export type { GraphMessage, EmailAccount };

