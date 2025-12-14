import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import OpenAI from "openai";
import { extractText } from "unpdf";

// Model options
const FAST_MODEL = process.env.EMAIL_FAST_MODEL ?? "gpt-4o-mini";
const BEST_MODEL = process.env.EMAIL_BEST_MODEL ?? "gpt-5-mini-2025-08-07";

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

// System prompt for multi-candidate vacancy email
const SYSTEM_PROMPT = `Du bist der E-Mail-Assistent für ein Schweizer Personalvermittlungs-CRM (QERO).

Deine Aufgabe: Kurze, selbstbewusste, professionelle deutsche E-Mails an Firmen schreiben, um MEHRERE Kandidaten für eine Vakanz vorzustellen.

WICHTIGE REGELN:
- Niemals Lohn/Tarif/Stundensatz erwähnen
- Niemals "Dossier", "Zeugnisse", "Referenzen" erwähnen – nur "Kurzprofile"
- Immer "temporär, Try & Hire oder direkt fest möglich" als Optionen anbieten
- Immer nach nächsten Schritten fragen oder Gespräch/Einsatz vorschlagen
- Schweizer Deutsch (Grüsse nicht Grüße, etc.)

BETREFF-REGELN für mehrere Kandidaten:
- Format: "[Anzahl] Kandidaten für [Vakanz-Titel]"
- Beispiel: "3 Kandidaten für Elektromonteur EFZ"
- Max 70 Zeichen

E-MAIL-STRUKTUR für mehrere Kandidaten:
1. Anrede (gegeben)
2. Einleitung: "Für Ihre Vakanz '[Vakanz-Titel]' habe ich [Anzahl] passende Kandidaten gefunden:"
3. Kandidaten-Liste: Für jeden Kandidaten kurz (1-2 Sätze):
   - Name, Position, Region
   - Wichtigste Stärke/Erfahrung
4. Gemeinsamkeiten/Vorteile: Was alle Kandidaten gemeinsam haben (z.B. alle verfügbar, alle mit Führerschein)
5. Optionen: "Eine Zusammenarbeit ist temporär, Try & Hire oder direkt fest möglich."
6. Call-to-Action: Frage nach welchem Kandidaten Interesse besteht
7. Abschluss: "Ich freue mich auf Ihre Rückmeldung."

STIL:
- Schreibe professionell und prägnant
- Kurze, prägnante Sätze
- Keine Füllwörter oder Marketing-Floskeln
- Keine Emojis
- Klarer Call-to-Action am Ende
- Spezifische Skills nennen

Antworte IMMER im JSON-Format: {"subject": "...", "body": "..."}
Der Body ist reiner Text (kein HTML, keine Signatur).`;

// POST /api/ai/generate-vacancy-email
// Body: { vacancyId: string, contactId: string, candidateIds: string[], mode?: "fast" | "best" }
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
    const { vacancyId, contactId, candidateIds, mode = "best" } = body;

    if (!vacancyId || !contactId || !candidateIds?.length) {
      return respondError("vacancyId, contactId, and candidateIds are required", 400);
    }

    const useGpt5 = mode === "best";
    const selectedModel = useGpt5 ? BEST_MODEL : FAST_MODEL;

    const adminSupabase = createAdminClient();

    // Fetch vacancy
    const { data: vacancy, error: vacancyError } = await adminSupabase
      .from("vacancies")
      .select("*")
      .eq("id", vacancyId)
      .single();

    if (vacancyError || !vacancy) {
      return respondError("Vacancy not found", 404);
    }

    // Fetch contact (company)
    const { data: contact, error: contactError } = await adminSupabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return respondError("Contact not found", 404);
    }

    // Fetch contact person for personalized greeting
    const { data: contactPerson } = await adminSupabase
      .from("contact_persons")
      .select("*")
      .eq("contact_id", contactId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch all candidates
    const { data: candidates, error: candidatesError } = await adminSupabase
      .from("tma_candidates")
      .select("*")
      .in("id", candidateIds);

    if (candidatesError || !candidates?.length) {
      return respondError("Candidates not found", 404);
    }

    // Build anrede
    // - male → "Sehr geehrter Herr <Nachname>"
    // - female → "Sehr geehrte Frau <Nachname>"
    // - unknown/no gender → fallback to company/team greeting
    let anrede: string;
    if (contactPerson?.last_name && contactPerson.gender === "male") {
      anrede = `Sehr geehrter Herr ${contactPerson.last_name}`;
    } else if (contactPerson?.last_name && contactPerson.gender === "female") {
      anrede = `Sehr geehrte Frau ${contactPerson.last_name}`;
    } else {
      anrede = `Sehr geehrtes ${contact.company_name} Team`;
    }

    // Try to extract text from PDFs (best effort)
    const candidateTexts: { name: string; text: string; data: typeof candidates[0] }[] = [];
    
    for (const candidate of candidates) {
      let pdfText = "";
      
      if (candidate.short_profile_url) {
        try {
          const pdfResponse = await fetch(candidate.short_profile_url);
          if (pdfResponse.ok) {
            const pdfBuffer = await pdfResponse.arrayBuffer();
            const { text } = await extractText(new Uint8Array(pdfBuffer));
            // text is string[] - join and truncate
            pdfText = (Array.isArray(text) ? text.join("\n") : String(text)).substring(0, 2000);
          }
        } catch {
          // PDF extraction failed, continue without it
        }
      }

      candidateTexts.push({
        name: `${candidate.first_name} ${candidate.last_name}`,
        text: pdfText,
        data: candidate,
      });
    }

    // Build candidate summaries
    const candidateSummaries = candidateTexts.map((c, i) => {
      const d = c.data;
      return `
KANDIDAT ${i + 1}: ${c.name}
- Position: ${d.position_title || "Nicht angegeben"}
- Region: ${d.postal_code || ""} ${d.city || d.canton || "Unbekannt"}
- Führerschein: ${d.driving_license || "Nicht angegeben"}
- Erfahrung: ${d.experience_level || "Nicht angegeben"}
- Qualität: ${d.status_tags?.join(", ") || d.status || "Nicht bewertet"}
${c.text ? `\nKurzprofil-Auszug:\n${c.text}` : ""}`;
    }).join("\n\n---\n");

    const userPrompt = `Erstelle eine E-Mail für folgende Situation:

VAKANZ:
- Titel: ${vacancy.title}
- Rolle: ${vacancy.role || vacancy.title}
- Standort: ${vacancy.postal_code || ""} ${vacancy.city || ""}
- Beschreibung: ${vacancy.description || "Keine Beschreibung"}

FIRMA: ${contact.company_name}
ANREDE: ${anrede}
ANZAHL KANDIDATEN: ${candidates.length}

${candidateSummaries}

AUFGABE:
Schreibe eine professionelle E-Mail die alle ${candidates.length} Kandidaten vorstellt.
- Betreff: "${candidates.length} Kandidaten für ${vacancy.title}"
- Beginne mit "${anrede}"
- Stelle jeden Kandidaten kurz vor (Name, Position, Stärke)
- Biete temporär/Try & Hire/fest an
- Frage welcher Kandidat interessant ist

Antworte NUR mit JSON: {"subject": "...", "body": "..."}`;

    const openai = getOpenAI();
    const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`;

    let responseText: string | undefined;

    try {
      if (useGpt5) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (openai as any).responses.create({
          model: selectedModel,
          reasoning: { effort: "low" },
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: fullPrompt }
              ]
            }
          ]
        });
        responseText = response.output_text?.trim();
      } else {
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        });
        responseText = completion.choices[0]?.message?.content?.trim();
      }
    } catch (openaiError) {
      console.error("[Vacancy Email] OpenAI API Error:", openaiError);
      const errorMessage = openaiError instanceof Error ? openaiError.message : "OpenAI API Fehler";
      return respondError(`OpenAI Fehler: ${errorMessage}`, 500);
    }

    console.log(`[Vacancy Email] Model: ${selectedModel}, Mode: ${mode}, Candidates: ${candidates.length}`);

    if (!responseText) {
      return respondError("AI konnte keine E-Mail generieren (leere Antwort)", 500);
    }

    // Parse JSON response
    let parsed: { subject: string; body: string };
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found");
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("[Vacancy Email] JSON parse error. Response:", responseText);
      return respondError("AI Antwort konnte nicht verarbeitet werden", 500);
    }

    if (!parsed.subject || !parsed.body) {
      return respondError("AI Antwort unvollständig", 500);
    }

    return respondSuccess({
      subject: parsed.subject,
      body: parsed.body,
    });
  } catch (error) {
    console.error("[Vacancy Email] Error:", error);
    return respondError(error instanceof Error ? error.message : "Failed to generate email", 500);
  }
}

