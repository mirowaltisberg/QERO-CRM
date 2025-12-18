import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken } from "@/lib/email/graph-client";
import type { EmailAccount } from "@/lib/email/graph-client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Helper to convert plain text to simple HTML
function textToHtml(text: string): string {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const html = paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">\n${html}\n</div>`;
}

// Default signature
const DEFAULT_SIGNATURE_HTML = `
<br><br>
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p style="margin: 0;">Freundliche Grüsse</p>
  <br>
  <p style="margin: 0; font-weight: bold;">Miró Maximilian Waltisberg</p>
  <p style="margin: 0;">Personalberater</p>
  <br>
  <table style="font-size: 14px; color: #333;">
    <tr><td style="padding-right: 12px;">Tel. M</td><td><a href="tel:+41772896446" style="color: #333; text-decoration: none;">+41 77 289 64 46</a></td></tr>
    <tr><td style="padding-right: 12px;">Tel. D</td><td><a href="tel:+41585105764" style="color: #333; text-decoration: none;">+41 58 510 57 64</a></td></tr>
    <tr><td style="padding-right: 12px;">E-Mail</td><td><a href="mailto:m.waltisberg@qero.ch" style="color: #333; text-decoration: none;">m.waltisberg@qero.ch</a></td></tr>
  </table>
  <p style="margin: 8px 0;"><a href="https://www.qero.ch/team/miro-waltisberg" style="color: #333;">Mehr Über mich</a></p>
  <br>
  <a href="https://www.qero.ch" target="_blank">
    <img src="https://qero.international/qero-logo-email.png" alt="QERO - vermittelt Timing." style="max-width: 180px; height: auto;" />
  </a>
  <br><br>
  <p style="margin: 0; font-size: 12px; color: #666;">
    QERO AG | Ifangstrasse 91 | 8153 Rümlang | Tel <a href="tel:+41585105757" style="color: #666; text-decoration: none;">+41 58 510 57 57</a> | <a href="mailto:info@qero.ch" style="color: #666; text-decoration: none;">info@qero.ch</a> | <a href="https://www.qero.ch" style="color: #666; text-decoration: none;">www.qero.ch</a>
  </p>
</div>
`;

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface GraphAttachment {
  "@odata.type": string;
  name: string;
  contentType: string;
  contentBytes: string;
}

// POST /api/contacts/[id]/send-vacancy-email
// Body: { vacancyId: string, candidateIds: string[], subject: string, body: string }
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const contactId = params.id;

    if (!contactId) {
      return respondError("Contact ID required", 400);
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const adminSupabase = createAdminClient();

    // Parse request body
    const body = await request.json();
    const { vacancyId, candidateIds, subject, body: emailBody } = body;

    if (!vacancyId || !candidateIds?.length || !subject || !emailBody) {
      return respondError("vacancyId, candidateIds, subject, and body are required", 400);
    }

    // Fetch contact
    const { data: contact, error: contactError } = await adminSupabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return respondError("Contact not found", 404);
    }

    if (!contact.email) {
      return respondError("Contact has no email address", 400);
    }

    // Fetch user's email account
    const { data: emailAccount, error: emailError } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (emailError || !emailAccount) {
      return respondError("Email account not configured", 400);
    }

    // Get valid access token
    const accessToken = await ensureValidToken(emailAccount as EmailAccount);
    if (!accessToken) {
      return respondError("Failed to get valid access token", 401);
    }

    // Fetch candidates for attachment
    const { data: candidates } = await adminSupabase
      .from("tma_candidates")
      .select("*")
      .in("id", candidateIds);

    // Prepare attachments (candidate PDFs)
    const attachments: GraphAttachment[] = [];
    const errors: string[] = [];

    if (candidates) {
      for (const candidate of candidates) {
        if (!candidate.short_profile_url) {
          errors.push(`${candidate.first_name} ${candidate.last_name}: Kein Kurzprofil`);
          continue;
        }

        try {
          const pdfResponse = await fetch(candidate.short_profile_url);
          if (!pdfResponse.ok) {
            errors.push(`${candidate.first_name} ${candidate.last_name}: PDF konnte nicht geladen werden`);
            continue;
          }

          const pdfBuffer = await pdfResponse.arrayBuffer();
          const base64 = Buffer.from(pdfBuffer).toString("base64");
          const fileName = `KP - ${candidate.first_name} ${candidate.last_name}.pdf`;

          attachments.push({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: fileName,
            contentType: "application/pdf",
            contentBytes: base64,
          });
        } catch {
          errors.push(`${candidate.first_name} ${candidate.last_name}: Fehler beim Laden des PDFs`);
        }
      }
    }

    // Build email HTML (body + signature)
    const bodyHtml = textToHtml(emailBody);
    const fullHtml = bodyHtml + DEFAULT_SIGNATURE_HTML;

    // Send email via Graph API
    const emailPayload = {
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: fullHtml,
        },
        toRecipients: [
          {
            emailAddress: {
              address: contact.email,
              name: contact.contact_name || contact.company_name,
            },
          },
        ],
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      saveToSentItems: true,
    };

    const sendResponse = await fetch(`${GRAPH_BASE_URL}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error("[Vacancy Email] Send failed:", errorText);
      return respondError("E-Mail konnte nicht gesendet werden", 500);
    }

    // Log call/activity
    await adminSupabase.from("contact_call_logs").insert({
      contact_id: contactId,
      user_id: user.id,
      outcome: "email",
      notes: `Vakanz-E-Mail gesendet: ${subject} (${candidates?.length || 0} Kandidaten)`,
    });

    return respondSuccess({
      message: "Email sent successfully",
      recipients: [contact.email],
      attachmentCount: attachments.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[Vacancy Email] Error:", error);
    return respondError(error instanceof Error ? error.message : "Failed to send email", 500);
  }
}






