import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import OpenAI from "openai";
import { extractText } from "unpdf";

// Model for standard drafts - GPT-5-mini with reasoning effort low
const STANDARD_MODEL = "gpt-5-mini-2025-08-07";

// Lazy initialization of OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Validator: check for issues that require regeneration
function validateEmailOutput(text: string): { valid: boolean; reason?: string } {
  // Check for bulletpoints
  if (text.includes("•") || text.includes("- ") || /^\s*[-*]\s/m.test(text)) {
    return { valid: false, reason: "Bulletpoints detected" };
  }
  
  // Check for analysis headers (common AI outputs)
  const headerPatterns = [
    /^#+\s/m,
    /\*\*[A-Z][^*]+\*\*/,
    /^[A-ZÄÖÜ][A-ZÄÖÜ\s]+:$/m,
    /Analyse:|Zusammenfassung:|Übersicht:|Fazit:/i,
  ];
  for (const pattern of headerPatterns) {
    if (pattern.test(text)) {
      return { valid: false, reason: "Analysis headers detected" };
    }
  }
  
  // Check for missing "Betreff:"
  if (!text.toLowerCase().includes("betreff:")) {
    return { valid: false, reason: "Missing Betreff:" };
  }
  
  // Check word count (body only, after Betreff line)
  const bodyStart = text.indexOf("\n\n");
  if (bodyStart > 0) {
    const body = text.substring(bodyStart).trim();
    const wordCount = body.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount > 170) {
      return { valid: false, reason: `Body too long: ${wordCount} words (max 170)` };
    }
  }
  
  return { valid: true };
}

// Parse the email output into subject and body
function parseEmailOutput(text: string): { subject: string; body: string } | null {
  const lines = text.trim().split("\n");
  
  // Find Betreff line
  let subjectLine = "";
  let bodyStartIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toLowerCase().startsWith("betreff:")) {
      subjectLine = line.replace(/^betreff:\s*/i, "").trim();
      bodyStartIndex = i + 1;
      break;
    }
  }
  
  if (!subjectLine) {
    return null;
  }
  
  // Skip empty lines after subject
  while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === "") {
    bodyStartIndex++;
  }
  
  // Get body (everything after subject + empty lines)
  const body = lines.slice(bodyStartIndex).join("\n").trim();
  
  if (!body) {
    return null;
  }
  
  return { subject: subjectLine, body };
}

// Build candidate facts for prompt
function buildCandidateFacts(candidate: {
  first_name: string;
  last_name: string;
  position_title: string | null;
  postal_code: string | null;
  city: string | null;
  canton: string | null;
  driving_license: string | null;
  experience_level: string | null;
  status_tags: string[] | null;
  status: string | null;
  activity_status: string | null;
}, pdfText: string): string {
  const facts = [
    `Name: ${candidate.first_name} ${candidate.last_name}`,
    `Position: ${candidate.position_title || "Fachkraft Elektro/Gebäudetechnik"}`,
    `Region: ${[candidate.postal_code, candidate.city || candidate.canton].filter(Boolean).join(" ") || "Schweiz"}`,
  ];
  
  if (candidate.driving_license) {
    facts.push(`Führerschein: ${candidate.driving_license}`);
  }
  if (candidate.experience_level) {
    facts.push(`Erfahrung: ${candidate.experience_level}`);
  }
  if (candidate.status_tags?.length) {
    facts.push(`Qualität: ${candidate.status_tags.join(", ")}`);
  }
  if (candidate.activity_status) {
    facts.push(`Verfügbarkeit: ${candidate.activity_status}`);
  }
  
  if (pdfText) {
    facts.push(`\nAus Kurzprofil:\n${pdfText}`);
  }
  
  return facts.join("\n");
}

// Generate email with OpenAI
async function generateEmail(
  candidateFacts: string,
  retryCount = 0
): Promise<{ subject: string; body: string }> {
  const openai = getOpenAI();
  
  const prompt = `Du bist ein Schweizer Personalberater (Elektro/Gebäudetechnik) und schreibst eine direkte, verkaufsstarke E-Mail, um einen Kandidaten vorzustellen.

FORMAT (strikt):
- Zeile 1: Betreff: <kurz, direkt, Nutzen>
- Zeile 2: leer
- Danach 2–4 kurze Absätze Fliesstext

WICHTIG:
- KEINE Begrüssung schreiben.
- KEINE Bulletpoints oder Überschriften.
- 80–140 Wörter Body.
- Kurzprofil und AGB müssen erwähnt werden („im Anhang").
- KEIN "Rufen Sie mich an" oder "Rückruf" - der Leser soll selbst entscheiden.
- Abschluss: "Ich freue mich auf Ihre Rückmeldung." oder ähnlich.
- KEINE Lohn-/Tarif-/CHF-Angaben.
- Stil: direkt, professionell, Schweizer Deutsch.

KANDIDAT:
${candidateFacts}

Schreibe jetzt die E-Mail.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai as any).responses.create({
    model: STANDARD_MODEL,
    reasoning: { effort: "low" },
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }],
      },
    ],
  });

  const outputText = response.output_text?.trim();
  
  if (!outputText) {
    throw new Error("Empty response from OpenAI");
  }
  
  // Validate output
  const validation = validateEmailOutput(outputText);
  
  if (!validation.valid && retryCount < 1) {
    console.log(`[Standard Draft] Validation failed: ${validation.reason}. Retrying...`);
    return generateEmail(candidateFacts, retryCount + 1);
  }
  
  // Parse output
  const parsed = parseEmailOutput(outputText);
  
  if (!parsed) {
    if (retryCount < 1) {
      console.log("[Standard Draft] Parse failed. Retrying...");
      return generateEmail(candidateFacts, retryCount + 1);
    }
    throw new Error("Could not parse email output");
  }
  
  return parsed;
}

// POST /api/email-draft/standard
// Body: { candidateId: string, companyId: string }
export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return respondError("OpenAI API key not configured", 500);
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const body = await request.json();
    const { candidateId, companyId } = body;

    if (!candidateId || !companyId) {
      return respondError("candidateId and companyId are required", 400);
    }

    const adminSupabase = createAdminClient();

    // Check if we already have a cached standard draft
    const { data: existingDraft } = await adminSupabase
      .from("candidate_company_email_drafts")
      .select("*")
      .eq("candidate_id", candidateId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (existingDraft?.standard_body) {
      // Return cached draft
      return respondSuccess({
        body: existingDraft.standard_body,
        subject: existingDraft.standard_subject,
        cached: true,
      });
    }

    // Fetch candidate
    const { data: candidate, error: candidateError } = await adminSupabase
      .from("tma_candidates")
      .select("*")
      .eq("id", candidateId)
      .single();

    if (candidateError || !candidate) {
      return respondError("Candidate not found", 404);
    }

    // Try to extract text from candidate's short profile PDF
    let pdfText = "";
    if (candidate.short_profile_url) {
      try {
        const pdfResponse = await fetch(candidate.short_profile_url);
        if (pdfResponse.ok) {
          const pdfBuffer = await pdfResponse.arrayBuffer();
          const { text } = await extractText(new Uint8Array(pdfBuffer));
          pdfText = (Array.isArray(text) ? text.join("\n") : String(text)).substring(0, 2000);
        }
      } catch {
        // PDF extraction failed, continue without it
      }
    }

    // Build candidate facts
    const candidateFacts = buildCandidateFacts(candidate, pdfText);

    // Generate email
    const { subject, body: emailBody } = await generateEmail(candidateFacts);

    // Save to database (upsert) - body WITHOUT greeting
    const { error: upsertError } = await adminSupabase
      .from("candidate_company_email_drafts")
      .upsert(
        {
          candidate_id: candidateId,
          company_id: companyId,
          standard_body: emailBody,
          standard_subject: subject,
          standard_updated_at: new Date().toISOString(),
        },
        {
          onConflict: "candidate_id,company_id",
        }
      );

    if (upsertError) {
      console.error("[Standard Draft] DB upsert error:", upsertError);
      // Still return the draft even if caching fails
    }

    console.log(`[Standard Draft] Generated for candidate ${candidateId} -> company ${companyId}`);

    return respondSuccess({
      body: emailBody,
      subject,
      cached: false,
    });
  } catch (error) {
    console.error("[Standard Draft] Error:", error);
    return respondError(error instanceof Error ? error.message : "Failed to generate draft", 500);
  }
}
