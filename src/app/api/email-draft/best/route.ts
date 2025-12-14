import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import OpenAI from "openai";
import { extractText } from "unpdf";

// Model for best drafts - GPT-5-mini with web research
const BEST_MODEL = "gpt-5-mini-2025-08-07";

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

// Research summary structure
interface ResearchSummary {
  whatTheyDo: string[];
  keywords: string[];
  confidence: "high" | "medium" | "low";
  sources: string[];
  rawInfo: string;
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

// Build research summary string
function buildResearchSummary(research: ResearchSummary): string {
  if (research.confidence === "low" || research.whatTheyDo.length === 0) {
    return "Keine spezifischen Informationen verfügbar. Bleibe allgemein.";
  }
  
  const parts = [];
  if (research.whatTheyDo.length > 0) {
    parts.push(`Tätigkeiten: ${research.whatTheyDo.join(", ")}`);
  }
  if (research.keywords.length > 0) {
    parts.push(`Keywords: ${research.keywords.join(", ")}`);
  }
  if (research.rawInfo) {
    parts.push(`Details: ${research.rawInfo.substring(0, 500)}`);
  }
  
  return parts.join("\n");
}

// Research company with web search
async function researchCompany(companyName: string): Promise<ResearchSummary> {
  const openai = getOpenAI();
  
  const researchPrompt = `Recherchiere die Schweizer Firma "${companyName}".

Finde heraus:
- Was macht die Firma? (Branche, Produkte/Dienstleistungen)
- Wichtige Keywords für ihre Tätigkeit
- Standort wenn möglich

Antworte im JSON-Format:
{
  "whatTheyDo": ["Punkt 1", "Punkt 2"],
  "keywords": ["keyword1", "keyword2"],
  "confidence": "high" | "medium" | "low",
  "sources": ["url1"],
  "rawInfo": "Zusammenfassung"
}

Confidence:
- "high": Klare, verifizierbare Infos
- "medium": Einige Infos, nicht vollständig
- "low": Wenig oder keine Infos`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai as any).responses.create({
      model: BEST_MODEL,
      reasoning: { effort: "medium" },
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: researchPrompt }],
        },
      ],
    });

    const outputText = response.output_text?.trim();
    
    if (outputText) {
      try {
        const jsonMatch = outputText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            whatTheyDo: parsed.whatTheyDo || [],
            keywords: parsed.keywords || [],
            confidence: parsed.confidence || "low",
            sources: parsed.sources || [],
            rawInfo: parsed.rawInfo || "",
          };
        }
      } catch {
        // JSON parse failed
      }
    }
  } catch (error) {
    console.error("[Best Draft] Research error:", error);
  }
  
  // Default: low confidence
  return {
    whatTheyDo: [],
    keywords: [],
    confidence: "low",
    sources: [],
    rawInfo: `Firma: ${companyName}. Keine weiteren Informationen verfügbar.`,
  };
}

// Generate personalized email with research
async function generateEmail(
  candidateFacts: string,
  researchSummary: string,
  confidence: string,
  retryCount = 0
): Promise<{ subject: string; body: string }> {
  const openai = getOpenAI();
  
  const prompt = `Du bist ein Schweizer Personalberater und schreibst eine personalisierte Verkaufs-E-Mail an eine Firma.

FORMAT (strikt):
- Zeile 1: Betreff: <direkt, Nutzen + Kandidat>
- Zeile 2: leer
- Danach 2–4 kurze Absätze Fliesstext

WICHTIG:
- KEINE Begrüssung.
- KEINE Bulletpoints, KEINE Analyse-Überschriften.
- 80–140 Wörter Body.
- Firmenrecherche nur nutzen, wenn Confidence = HIGH oder MEDIUM, sonst bewusst allgemein bleiben.
- Kurzprofil und AGB IMMER erwähnen („im Anhang").
- KEINE Lohn-/Tarif-/CHF-Angaben.
- KEIN "Rufen Sie mich an" oder "Rückruf" - der Leser soll selbst entscheiden.
- Abschluss: "Ich freue mich auf Ihre Rückmeldung." oder ähnlich.
- Stil: direkt, professionell, Schweizer Deutsch.
- Niemals Telefonnummern angeben

FIRMENRECHERCHE:
${researchSummary}
Confidence: ${confidence}

KANDIDAT:
${candidateFacts}

Schreibe jetzt die E-Mail.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai as any).responses.create({
    model: BEST_MODEL,
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
    console.log(`[Best Draft] Validation failed: ${validation.reason}. Retrying...`);
    return generateEmail(candidateFacts, researchSummary, confidence, retryCount + 1);
  }
  
  // Parse output
  const parsed = parseEmailOutput(outputText);
  
  if (!parsed) {
    if (retryCount < 1) {
      console.log("[Best Draft] Parse failed. Retrying...");
      return generateEmail(candidateFacts, researchSummary, confidence, retryCount + 1);
    }
    throw new Error("Could not parse email output");
  }
  
  return parsed;
}

// POST /api/email-draft/best
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

    // Fetch candidate
    const { data: candidate, error: candidateError } = await adminSupabase
      .from("tma_candidates")
      .select("*")
      .eq("id", candidateId)
      .single();

    if (candidateError || !candidate) {
      return respondError("Candidate not found", 404);
    }

    // Fetch company
    const { data: company, error: companyError } = await adminSupabase
      .from("contacts")
      .select("*")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return respondError("Company not found", 404);
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

    // Step 1: Research the company
    console.log(`[Best Draft] Researching company: ${company.company_name}`);
    const research = await researchCompany(company.company_name);
    console.log(`[Best Draft] Research confidence: ${research.confidence}`);

    // Build prompts
    const candidateFacts = buildCandidateFacts(candidate, pdfText);
    const researchSummary = buildResearchSummary(research);

    // Step 2: Generate email
    const { subject, body: emailBody } = await generateEmail(
      candidateFacts,
      researchSummary,
      research.confidence
    );

    // Save to database (upsert) - body WITHOUT greeting, standard_body unchanged
    const { error: upsertError } = await adminSupabase
      .from("candidate_company_email_drafts")
      .upsert(
        {
          candidate_id: candidateId,
          company_id: companyId,
          best_body: emailBody,
          best_subject: subject,
          best_updated_at: new Date().toISOString(),
          best_research_summary: research,
          best_research_confidence: research.confidence,
        },
        {
          onConflict: "candidate_id,company_id",
        }
      );

    if (upsertError) {
      console.error("[Best Draft] DB upsert error:", upsertError);
      // Still return the draft even if caching fails
    }

    console.log(`[Best Draft] Generated for candidate ${candidateId} -> company ${companyId}`);

    return respondSuccess({
      body: emailBody,
      subject,
      researchSummary: research,
      confidence: research.confidence,
      cached: false,
    });
  } catch (error) {
    console.error("[Best Draft] Error:", error);
    return respondError(error instanceof Error ? error.message : "Failed to generate draft", 500);
  }
}
