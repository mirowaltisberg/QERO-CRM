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

// Email template (default)
const DEFAULT_EMAIL_SUBJECT = "Kandidatenvorschläge & AGB";

// Plain text version for editing
const DEFAULT_EMAIL_BODY_TEXT = `Guten Tag

Im Anhang sende ich Ihnen die Kurzprofile eines oder mehrerer Kandidaten, die fachlich und persönlich sehr gut zu Ihrem Unternehmen passen.

Die Unterlagen geben Ihnen einen ersten Überblick. Gerne organisiere ich bei Interesse ein persönliches Gespräch oder einen unverbindlichen Einsatz.

Zusätzlich finden Sie unsere AGB im Anhang.

Für Rückfragen stehe ich Ihnen jederzeit gerne zur Verfügung.`;

// Helper to convert plain text to simple HTML
function textToHtml(text: string): string {
  // Convert line breaks to paragraphs
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const html = paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">\n${html}\n</div>`;
}

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

// Attachment type for Graph API
interface GraphAttachment {
  "@odata.type": string;
  name: string;
  contentType: string;
  contentBytes: string;
}

// Candidate attachment info for preview
interface CandidateAttachmentInfo {
  candidateId: string;
  name: string;
  fileName: string;
  hasProfile: boolean;
  error?: string;
}

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

// Helper to get AGB PDF as base64
function getAgbAttachment(): GraphAttachment | null {
  try {
    const pdfPath = path.join(process.cwd(), "public", "files", "AGB-QERO.pdf");
    if (fs.existsSync(pdfPath)) {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfBase64 = pdfBuffer.toString("base64");
      return {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: "AGB QERO AG.pdf",
        contentType: "application/pdf",
        contentBytes: pdfBase64,
      };
    }
  } catch (err) {
    console.error("[Send Email] Error reading AGB PDF:", err);
  }
  return null;
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

// Helper to fetch candidate info and validate short_profile_url
async function getCandidateAttachmentInfo(
  candidateIds: string[],
  adminSupabase: ReturnType<typeof createAdminClient>
): Promise<CandidateAttachmentInfo[]> {
  if (candidateIds.length === 0) return [];

  const { data: candidates, error } = await adminSupabase
    .from("tma_candidates")
    .select("id, first_name, last_name, short_profile_url")
    .in("id", candidateIds);

  if (error || !candidates) {
    return candidateIds.map((id) => ({
      candidateId: id,
      name: "Unknown",
      fileName: "KP - Unknown.pdf",
      hasProfile: false,
      error: "Kandidat nicht gefunden",
    }));
  }

  // Map by ID for easy lookup
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  return candidateIds.map((id) => {
    const candidate = candidateMap.get(id);
    if (!candidate) {
      return {
        candidateId: id,
        name: "Unknown",
        fileName: "KP - Unknown.pdf",
        hasProfile: false,
        error: "Kandidat nicht gefunden",
      };
    }

    const name = `${candidate.first_name} ${candidate.last_name}`;
    const fileName = `KP - ${candidate.first_name} ${candidate.last_name}.pdf`;

    if (!candidate.short_profile_url) {
      return {
        candidateId: id,
        name,
        fileName,
        hasProfile: false,
        error: `Kein Kurzprofil für ${name} vorhanden`,
      };
    }

    return {
      candidateId: id,
      name,
      fileName,
      hasProfile: true,
    };
  });
}

// Helper to download PDF from URL and convert to base64
async function downloadPdfAsBase64(url: string): Promise<{ base64: string } | { error: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      // Still try to proceed - some storage providers don't set correct content-type
      console.warn(`[Download PDF] Unexpected content-type: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    return { base64 };
  } catch (err) {
    console.error("[Download PDF] Error:", err);
    return { error: err instanceof Error ? err.message : "Download fehlgeschlagen" };
  }
}

// Helper to build candidate attachments
async function buildCandidateAttachments(
  candidateIds: string[],
  adminSupabase: ReturnType<typeof createAdminClient>
): Promise<{ attachments: GraphAttachment[]; errors: string[] }> {
  if (candidateIds.length === 0) {
    return { attachments: [], errors: [] };
  }

  const { data: candidates, error } = await adminSupabase
    .from("tma_candidates")
    .select("id, first_name, last_name, short_profile_url")
    .in("id", candidateIds);

  if (error || !candidates) {
    return { attachments: [], errors: ["Kandidaten konnten nicht geladen werden"] };
  }

  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  const attachments: GraphAttachment[] = [];
  const errors: string[] = [];

  // Process in order of candidateIds
  for (const id of candidateIds) {
    const candidate = candidateMap.get(id);
    if (!candidate) {
      errors.push(`Kandidat mit ID ${id} nicht gefunden`);
      continue;
    }

    const name = `${candidate.first_name} ${candidate.last_name}`;

    if (!candidate.short_profile_url) {
      errors.push(`Kein Kurzprofil für ${name} vorhanden`);
      continue;
    }

    const result = await downloadPdfAsBase64(candidate.short_profile_url);
    if ("error" in result) {
      errors.push(`Kurzprofil für ${name} konnte nicht geladen werden: ${result.error}`);
      continue;
    }

    attachments.push({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: `KP - ${candidate.first_name} ${candidate.last_name}.pdf`,
      contentType: "application/pdf",
      contentBytes: result.base64,
    });
  }

  return { attachments, errors };
}

// GET /api/contacts/[id]/send-email - Preview email (don't send)
// Query params:
// - candidateIds: comma-separated list of candidate IDs (optional)
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const candidateIdsParam = searchParams.get("candidateIds");
  const candidateIds = candidateIdsParam ? candidateIdsParam.split(",").filter(Boolean) : [];

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
    
    // For preview: full HTML with signature
    const bodyHtml = textToHtml(DEFAULT_EMAIL_BODY_TEXT);
    const fullBodyHtml = `${bodyHtml}${signatureHtml}`;

    // Get candidate attachment info for preview
    const candidateAttachments = await getCandidateAttachmentInfo(candidateIds, adminSupabase);

    // Check AGB
    const hasAgb = checkAgbPdf();

    // Build attachments list for preview
    const attachmentsList: Array<{ name: string; type: "candidate" | "agb"; error?: string }> = [];

    // Add candidate attachments first
    for (const ca of candidateAttachments) {
      attachmentsList.push({
        name: ca.fileName,
        type: "candidate",
        error: ca.error,
      });
    }

    // Add AGB last
    if (hasAgb) {
      attachmentsList.push({
        name: "AGB QERO AG.pdf",
        type: "agb",
      });
    }

    // Check if any candidates have errors
    const hasErrors = candidateAttachments.some((ca) => !ca.hasProfile);

    return respondSuccess({
      recipients: emails,
      subject: DEFAULT_EMAIL_SUBJECT,
      bodyText: DEFAULT_EMAIL_BODY_TEXT, // Plain text for editing
      bodyHtml: fullBodyHtml, // Full HTML with signature for preview
      attachments: attachmentsList,
      hasAttachment: attachmentsList.length > 0,
      candidateErrors: hasErrors,
      canSend: !hasErrors || candidateIds.length === 0, // Can send if no candidates or all have profiles
    });
  } catch (err) {
    console.error("[Email Preview] Error:", err);
    return respondError("Vorschau konnte nicht geladen werden", 500);
  }
}

// POST /api/contacts/[id]/send-email - Actually send the email
// Body:
// - candidateIds: string[] (optional)
// - subject: string (optional, overrides default)
// - body: string (optional, overrides default body - signature is still appended)
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Parse request body
    let candidateIds: string[] = [];
    let customSubject: string | null = null;
    let customBody: string | null = null;

    try {
      const body = await request.json();
      candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds : [];
      customSubject = typeof body.subject === "string" ? body.subject : null;
      customBody = typeof body.body === "string" ? body.body : null;
    } catch {
      // No body or invalid JSON - use defaults
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
    
    // Fetch contact info for greeting
    const { data: contact } = await adminSupabase
      .from("contacts")
      .select("company_name, email")
      .eq("id", id)
      .single();

    // Fetch ALL contact persons with emails
    const { data: contactPersons } = await adminSupabase
      .from("contact_persons")
      .select("first_name, last_name, gender, email")
      .eq("contact_id", id);

    // Use custom subject if provided, otherwise use default
    const subject = customSubject || DEFAULT_EMAIL_SUBJECT;

    // Build attachments array (same for all emails)
    const attachments: GraphAttachment[] = [];

    // First, add candidate attachments (if any)
    if (candidateIds.length > 0) {
      const { attachments: candidateAttachments, errors } = await buildCandidateAttachments(
        candidateIds,
        adminSupabase
      );

      // If there are errors, block sending
      if (errors.length > 0) {
        return respondError(errors.join("; "), 400);
      }

      attachments.push(...candidateAttachments);
    }

    // Then, add AGB attachment
    const agbAttachment = getAgbAttachment();
    if (agbAttachment) {
      attachments.push(agbAttachment);
    } else {
      console.warn("[Send Email] AGB PDF not found");
    }

    // Get access token
    const accessToken = await ensureValidToken(emailAccount);

    // Helper to generate greeting for a recipient
    // - male → "Sehr geehrter Herr <Nachname>,"
    // - female → "Sehr geehrte Frau <Nachname>,"
    // - unknown/no gender → fallback to company/team greeting
    const generateGreeting = (person?: { first_name: string; last_name: string; gender?: string | null } | null): string => {
      if (person?.last_name && person.gender === "male") {
        return `Sehr geehrter Herr ${person.last_name},`;
      }
      if (person?.last_name && person.gender === "female") {
        return `Sehr geehrte Frau ${person.last_name},`;
      }
      // Fallback: company/team greeting for unknown gender or no person
      return contact?.company_name 
        ? `Sehr geehrtes ${contact.company_name} Team,`
        : "Sehr geehrtes Team,";
    };

    // Helper to send a single email
    const sendSingleEmail = async (recipientEmail: string, greeting: string, recipientName?: string) => {
      const bodyText = customBody ? `${greeting}\n\n${customBody}` : `${greeting}\n\n${DEFAULT_EMAIL_BODY_TEXT}`;
      const bodyHtml = textToHtml(bodyText);
      const fullBodyHtml = `${bodyHtml}${signatureHtml}`;

      const message = {
        subject,
        body: {
          contentType: "html",
          content: fullBodyHtml,
        },
        toRecipients: [
          {
            emailAddress: { 
              address: recipientEmail,
              name: recipientName,
            },
          },
        ],
        attachments,
      };

      const response = await fetch(`${GRAPH_BASE_URL}/me/sendMail`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const shortError = errorText?.slice(0, 200) || `HTTP ${response.status}`;
        console.error(`[Send Email] Failed for ${recipientEmail}:`, response.status, errorText);
        return { success: false, email: recipientEmail, error: shortError };
      }

      return { success: true, email: recipientEmail };
    };

    // Collect all recipients to send to
    const recipientsToSend: { email: string; greeting: string; name?: string }[] = [];
    const attemptedRecipients: { email: string; name?: string; reason?: string }[] = [];
    const invalidRecipients: { email: string; error: string }[] = [];

    // Helper to normalize email addresses
    const normalizeEmail = (email: string | null | undefined): string | null => {
      if (!email) return null;
      const trimmed = email.trim().toLowerCase();
      // Basic validation: must contain @ and a dot after @
      if (!trimmed.includes("@") || !trimmed.split("@")[1]?.includes(".")) {
        return null;
      }
      return trimmed;
    };

    // Build debug info for diagnostics (returned to UI)
    const debugInfo = {
      companyName: contact?.company_name || "N/A",
      companyEmail: contact?.email || "NONE",
      contactPersonsCount: contactPersons?.length || 0,
      contactPersons: (contactPersons || []).map((p, i) => ({
        index: i + 1,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unnamed",
        email: p.email || "NONE",
        gender: p.gender || "unknown",
      })),
    };

    console.log(`[Send Email] Debug info:`, JSON.stringify(debugInfo, null, 2));

    // 1. Add general company email(s) (split on comma/semicolon) if valid
    const seenEmails = new Set<string>(); // Track normalized emails to avoid duplicates

    if (contact?.email) {
      contact.email.split(/[,;]/).forEach((raw: string) => {
        const normalized = normalizeEmail(raw);
        const display = raw?.trim() || "";
        if (!normalized) {
          invalidRecipients.push({ email: display || "(leer)", error: "Ungültige E-Mail-Adresse" });
          attemptedRecipients.push({ email: display || "(leer)", reason: "invalid" });
          return;
        }
        if (seenEmails.has(normalized)) return;
        seenEmails.add(normalized);
        recipientsToSend.push({
          email: normalized,
          greeting: generateGreeting(null), // Company greeting
          name: contact?.company_name || undefined,
        });
        attemptedRecipients.push({ email: normalized, name: contact?.company_name || undefined });
      });
    }

    // 2. Add each contact person with individual email (skip duplicates, report invalids)
    for (const person of contactPersons || []) {
      const displayName = `${person.first_name || ""} ${person.last_name || ""}`.trim() || undefined;
      const normalizedEmail = normalizeEmail(person.email);
      const rawDisplay = person.email?.trim() || "";
      if (!normalizedEmail) {
        invalidRecipients.push({ email: rawDisplay || "(leer)", error: "Ungültige E-Mail-Adresse" });
        attemptedRecipients.push({ email: rawDisplay || "(leer)", name: displayName, reason: "invalid" });
        continue;
      }
      if (seenEmails.has(normalizedEmail)) {
        attemptedRecipients.push({ email: normalizedEmail, name: displayName, reason: "duplicate" });
        continue;
      }
      seenEmails.add(normalizedEmail);
      recipientsToSend.push({
        email: normalizedEmail,
        greeting: generateGreeting(person),
        name: displayName,
      });
      attemptedRecipients.push({ email: normalizedEmail, name: displayName });
    }

    // 3. Fallback: if helper provided extra emails (e.g., contact person emails) that didn't appear above, send with generic greeting
    // This ensures we still send to contact-person emails even if the detailed fetch missed them for any reason.
    for (const helperEmail of emails) {
      const normalizedEmail = normalizeEmail(helperEmail);
      if (!normalizedEmail) continue;
      if (seenEmails.has(normalizedEmail)) continue;
      seenEmails.add(normalizedEmail);
      recipientsToSend.push({
        email: normalizedEmail,
        greeting: generateGreeting(null), // generic company/team greeting
        name: contact?.company_name || undefined,
      });
      attemptedRecipients.push({ email: normalizedEmail, name: contact?.company_name || undefined, reason: "fallback-helper" });
    }

    // If no valid recipients found, return error with debug info
    if (recipientsToSend.length === 0) {
      return respondError("Keine gültigen E-Mail-Adressen gefunden. Bitte prüfe die Kontaktdaten.", 400, {
        debugInfo,
        attemptedRecipients,
        failedRecipients: invalidRecipients,
      });
    }

    // Log what we're about to send
    console.log(`[Send Email] Sending to ${recipientsToSend.length} recipients:`, 
      recipientsToSend.map(r => `${r.name || "?"} <${r.email}>`).join(", "));
    
    const results = await Promise.all(
      recipientsToSend.map(r => sendSingleEmail(r.email, r.greeting, r.name))
    );

    const successful = results.filter(r => r.success);
    const failedSend = results.filter(r => !r.success);
    const failed = [...invalidRecipients, ...failedSend];

    console.log(`[Send Email] Results: ${successful.length} sent, ${failed.length} failed`);
    if (failed.length > 0) {
      console.log(`[Send Email] Failed recipients:`, failed);
    }

    if (failed.length > 0 && successful.length === 0) {
      return respondError(
        `Alle E-Mails fehlgeschlagen: ${failed.map(f => `${f.email} (${f.error})`).join(", ")}`,
        500,
        {
          attemptedRecipients,
          failedRecipients: failed.map(f => ({ email: f.email, error: f.error })),
          debugInfo,
        }
      );
    }

    return respondSuccess({
      sent: true,
      // Detailed recipient info for UI
      attemptedRecipients,
      recipients: successful.map(r => r.email),
      failedRecipients: failed.length > 0 ? failed.map(f => ({ email: f.email, error: f.error })) : undefined,
      attachmentCount: attachments.length,
      emailCount: successful.length,
      // Include debug info so UI can show what was found
      debugInfo,
    });
  } catch (err) {
    console.error("[Send Email] Error:", err);
    return respondError(
      err instanceof Error ? err.message : "E-Mail konnte nicht gesendet werden",
      500
    );
  }
}
