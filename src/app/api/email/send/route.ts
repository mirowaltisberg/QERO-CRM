import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken } from "@/lib/email/graph-client";
import type { EmailAccount } from "@/lib/email/graph-client";
import { z } from "zod";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

const AttachmentSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  contentBytes: z.string(), // base64
});

const SendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1, "At least one recipient required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  replyToMessageId: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

// POST /api/email/send - Send an email with optional attachments
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Parse and validate body
    const body = await request.json();
    const parsed = SendEmailSchema.safeParse(body);

    if (!parsed.success) {
      return respondError(parsed.error.issues[0].message, 400);
    }

    const { to, subject, body: emailBody, cc, bcc, replyToMessageId, attachments } = parsed.data;

    // Get email account with tokens
    const adminSupabase = createAdminClient();
    const { data: account, error: accountError } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .single();

    if (accountError || !account) {
      return respondError("No email account connected", 404);
    }

    const emailAccount = account as EmailAccount;

    try {
      // Ensure we have a valid access token
      const accessToken = await ensureValidToken(emailAccount);

      // Build the message payload for Graph API
      const message: {
        subject: string;
        body: { contentType: string; content: string };
        toRecipients: Array<{ emailAddress: { address: string } }>;
        ccRecipients?: Array<{ emailAddress: { address: string } }>;
        bccRecipients?: Array<{ emailAddress: { address: string } }>;
        attachments?: Array<{
          "@odata.type": string;
          name: string;
          contentType: string;
          contentBytes: string;
        }>;
      } = {
        subject,
        body: {
          contentType: "html",
          content: emailBody,
        },
        toRecipients: to.map((email) => ({
          emailAddress: { address: email },
        })),
      };

      if (cc && cc.length > 0) {
        message.ccRecipients = cc.map((email) => ({
          emailAddress: { address: email },
        }));
      }

      if (bcc && bcc.length > 0) {
        message.bccRecipients = bcc.map((email) => ({
          emailAddress: { address: email },
        }));
      }

      // Add attachments if present
      if (attachments && attachments.length > 0) {
        message.attachments = attachments.map((att) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: att.name,
          contentType: att.contentType,
          contentBytes: att.contentBytes,
        }));
      }

      // Send via Graph API
      const sendUrl = replyToMessageId
        ? `${GRAPH_BASE_URL}/me/messages/${replyToMessageId}/reply`
        : `${GRAPH_BASE_URL}/me/sendMail`;

      let response: Response;

      if (replyToMessageId) {
        // Reply format is different
        response = await fetch(sendUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            message: {
              body: message.body,
              toRecipients: message.toRecipients,
              ccRecipients: message.ccRecipients,
              attachments: message.attachments,
            },
          }),
        });
      } else {
        // New message
        response = await fetch(sendUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ message }),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Send Email] Graph API error:", response.status, errorText);
        return respondError(`Failed to send email: ${response.status}`, 500);
      }

      return respondSuccess({ sent: true });
    } catch (sendError) {
      console.error("Send email error:", sendError);
      return respondError(
        sendError instanceof Error ? sendError.message : "Failed to send email",
        500
      );
    }
  } catch (err) {
    console.error("Email send error:", err);
    return respondError("Failed to send email", 500);
  }
}

