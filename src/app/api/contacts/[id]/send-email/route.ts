import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken } from "@/lib/email/graph-client";
import type { EmailAccount } from "@/lib/email/graph-client";
import * as fs from "fs";
import * as path from "path";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Email template
const EMAIL_SUBJECT = "Kandidatenvorschläge & AGB";

const EMAIL_BODY_HTML = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
<p>Guten Tag</p>
<p>Im Anhang sende ich Ihnen die Kurzprofile eines oder mehrerer Kandidaten, die fachlich und persönlich sehr gut zu Ihrem Unternehmen passen.</p>
<p>Die Unterlagen geben Ihnen einen ersten Überblick. Gerne organisiere ich bei Interesse ein persönliches Gespräch oder einen unverbindlichen Einsatz.</p>
<p>Zusätzlich finden Sie unsere AGB im Anhang.</p>
<p>Für Rückfragen stehe ich Ihnen jederzeit gerne zur Verfügung.</p>
</div>`;

// Default signature (same as in settings/signature/route.ts)
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

// Helper to get all emails for a contact
async function getContactEmails(contactId: string, adminSupabase: ReturnType<typeof createAdminClient>) {
  // Get contact
  const { data: contact, error: contactError } = await adminSupabase
    .from("contacts")
    .select("id, company_name, contact_name, email")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return { error: "Contact not found", contact: null, emails: [] };
  }

  // Get contact persons
  const { data: persons } = await adminSupabase
    .from("contact_persons")
    .select("first_name, last_name, email")
    .eq("contact_id", contactId);

  // Collect all emails
  const allEmails = new Set<string>();

  // Add contact email(s) - could be comma-separated
  if (contact.email) {
    contact.email.split(/[,;]/).forEach((e: string) => {
      const trimmed = e.trim().toLowerCase();
      if (trimmed && trimmed.includes("@")) {
        allEmails.add(trimmed);
      }
    });
  }

  // Add contact person emails
  if (persons) {
    persons.forEach((p) => {
      if (p.email) {
        const trimmed = p.email.trim().toLowerCase();
        if (trimmed && trimmed.includes("@")) {
          allEmails.add(trimmed);
        }
      }
    });
  }

  return { error: null, contact, emails: Array.from(allEmails) };
}

// Helper to check if AGB PDF exists
function checkAgbPdf(): boolean {
  try {
    const pdfPath = path.join(process.cwd(), "public", "files", "AGB-QERO.pdf");
    return fs.existsSync(pdfPath);
  } catch {
    return false;
  }
}

// Helper to get user signature - returns default if not customized
async function getUserSignature(userId: string, adminSupabase: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("email_signature_html")
    .eq("id", userId)
    .single();
  
  // Return user's signature if set, otherwise return default
  return profile?.email_signature_html || DEFAULT_SIGNATURE_HTML;
}

// GET /api/contacts/[id]/send-email - Preview email (don't send)
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const adminSupabase = createAdminClient();

    // Check if user has email account connected
    const { data: account } = await adminSupabase
      .from("email_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .single();

    if (!account) {
      return respondError("Bitte verbinde zuerst dein Outlook-Konto in den Einstellungen.", 404);
    }

    // Get emails
    const { error, emails } = await getContactEmails(id, adminSupabase);
    if (error) {
      return respondError(error, 404);
    }

    if (emails.length === 0) {
      return respondError("Keine E-Mail-Adressen für diesen Kontakt gefunden.", 400);
    }

    // Get signature (will use default if not customized)
    const signatureHtml = await getUserSignature(user.id, adminSupabase);
    const fullBodyHtml = `${EMAIL_BODY_HTML}${signatureHtml}`;

    // Check attachment
    const hasAttachment = checkAgbPdf();

    return respondSuccess({
      recipients: emails,
      subject: EMAIL_SUBJECT,
      body: fullBodyHtml,
      hasAttachment,
    });
  } catch (err) {
    console.error("[Email Preview] Error:", err);
    return respondError("Vorschau konnte nicht geladen werden", 500);
  }
}

// POST /api/contacts/[id]/send-email - Actually send the email
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const adminSupabase = createAdminClient();

    // Get email account with tokens
    const { data: account, error: accountError } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .single();

    if (accountError || !account) {
      return respondError("Bitte verbinde zuerst dein Outlook-Konto in den Einstellungen.", 404);
    }

    const emailAccount = account as EmailAccount;

    // Get emails
    const { error, emails } = await getContactEmails(id, adminSupabase);
    if (error) {
      return respondError(error, 404);
    }

    if (emails.length === 0) {
      return respondError("Keine E-Mail-Adressen für diesen Kontakt gefunden.", 400);
    }

    // Get signature (will use default if not customized)
    const signatureHtml = await getUserSignature(user.id, adminSupabase);
    const fullBodyHtml = `${EMAIL_BODY_HTML}${signatureHtml}`;

    // Read AGB PDF attachment
    let attachments: Array<{
      "@odata.type": string;
      name: string;
      contentType: string;
      contentBytes: string;
    }> = [];

    try {
      const pdfPath = path.join(process.cwd(), "public", "files", "AGB-QERO.pdf");
      if (fs.existsSync(pdfPath)) {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfBase64 = pdfBuffer.toString("base64");
        attachments.push({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: "AGB QERO AG.pdf",
          contentType: "application/pdf",
          contentBytes: pdfBase64,
        });
      } else {
        console.warn("[Send Email] AGB PDF not found at:", pdfPath);
      }
    } catch (fileErr) {
      console.error("[Send Email] Error reading AGB PDF:", fileErr);
    }

    // Get access token
    const accessToken = await ensureValidToken(emailAccount);

    // Build the message payload
    const message = {
      subject: EMAIL_SUBJECT,
      body: {
        contentType: "HTML",
        content: fullBodyHtml,
      },
      toRecipients: emails.map((email) => ({
        emailAddress: { address: email },
      })),
      attachments,
    };

    // Send via Graph API
    const response = await fetch(`${GRAPH_BASE_URL}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Send Email] Graph API error:", response.status, errorText);
      return respondError(`E-Mail konnte nicht gesendet werden: ${response.status}`, 500);
    }

    return respondSuccess({
      sent: true,
      recipients: emails,
      attachmentIncluded: attachments.length > 0,
    });
  } catch (err) {
    console.error("[Send Email] Error:", err);
    return respondError(
      err instanceof Error ? err.message : "E-Mail konnte nicht gesendet werden",
      500
    );
  }
}
