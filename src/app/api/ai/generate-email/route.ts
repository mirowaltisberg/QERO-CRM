import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import OpenAI from "openai";

// Model options - "fast" uses gpt-4o-mini, "best" uses gpt-5-mini
// Can be overridden via environment variables
const FAST_MODEL = process.env.EMAIL_FAST_MODEL ?? "gpt-4o-mini";
const BEST_MODEL = process.env.EMAIL_BEST_MODEL ?? "gpt-5-mini-2025-08-07";

// Lazy initialization of OpenAI client (to avoid build-time errors)
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

// System prompt for email generation
const SYSTEM_PROMPT = `Du bist der E-Mail-Assistent für ein Schweizer Personalvermittlungs-CRM (QERO).

Deine Aufgabe: Kurze, selbstbewusste, professionelle deutsche E-Mails an Firmen schreiben, um einen Kandidaten vorzustellen.

WICHTIGE REGELN:
- Niemals Lohn/Tarif/Stundensatz erwähnen
- Niemals "Dossier", "Zeugnisse", "Referenzen" erwähnen – nur "Kurzprofil"
- Immer "temporär, Try & Hire oder direkt fest möglich" als Optionen anbieten
- Immer nach nächsten Schritten fragen oder Gespräch/Einsatz vorschlagen
- Schweizer Deutsch (Grüsse nicht Grüße, etc.)

BETREFF-REGELN:
- Format: "Gemäss Telefongespräch – [Position] [Qualifikation] ([Regionskürzel])"
- Beispiel: "Gemäss Telefongespräch – Montage-Elektriker EFZ"
- Beispiel: "Gemäss Telefongespräch – Elektromonteur EFZ / Servicetechniker (SO)"
- Max 70 Zeichen

E-MAIL-STRUKTUR:
1. Anrede (gegeben)
2. Einleitung: "Wie kurz besprochen / Gerne sende ich Ihnen das Kurzprofil von [Vorname Nachname], [Position], aus der Region [PLZ Ort]."
3. Hauptteil (2-3 Sätze): Erfahrung in Jahren + spezifische Fähigkeiten + Arbeitsweise + Stärken
4. Flexibilität: Führerschein + Fahrzeug + Verfügbarkeit erwähnen wenn vorhanden
5. Optionen: "Eine Zusammenarbeit ist temporär, Try & Hire oder direkt fest möglich."
6. Call-to-Action: Frage nach nächsten Schritten ODER biete Gespräch/Einsatz an
7. Abschluss: "Ich freue mich auf Ihre Rückmeldung."

STIL:
- Schreibe professionell und prägnant
- Kurze, prägnante Sätze
- Keine Füllwörter oder Marketing-Floskeln
- Keine Emojis
- Klarer Call-to-Action am Ende
- Spezifische Skills nennen (z.B. NIN, Verdrahtung, Photovoltaik)
- Erfahrung quantifizieren (z.B. "mehr als 3 Jahre", "über 20 Jahre")
- Selbstbewusst aber nicht übertrieben

===== BEISPIEL 1 =====
Betreff: Gemäss Telefongespräch – Montage-Elektriker EFZ

Guten Tag Herr Müller

Wie kurz besprochen, sende ich Ihnen gerne das Kurzprofil von Jonathan Fuerst, Montage-Elektriker EFZ, aus der Region 8055 Zürich.

Herr Fuerst verfügt über mehr als 3 Jahre Berufserfahrung in der Installation, Wartung und Inbetriebnahme von elektrischen Anlagen. Er ist sehr sicher im Verdrahten, Anschliessen und Prüfen nach NIN, arbeitet sauber und zuverlässig und ist es gewohnt, selbstständig sowie im Team auf Baustellen zu agieren. Der Umgang mit Kunden und Bauleitungen ist für ihn selbstverständlich.

Dank Führerschein und eigenem Fahrzeug ist er flexibel einsetzbar. Eine Zusammenarbeit ist temporär, Try & Hire oder direkt fest möglich.

Wann kann er bei Ihnen in einem Try and Hire starten?
Geben Sie mir kurz Bescheid, wie die nächsten Schritte aussehen sollen.

===== BEISPIEL 2 (nach Telefongespräch) =====
Betreff: Gemäss Telefongespräch – Elektromonteur EFZ / Servicetechniker (SO)

Guten Tag Herr Schmidt

Gerne sende ich Ihnen das Kurzprofil von Daniel Ettlin, Elektromonteur EFZ / Servicetechniker, aus der Region 4629 Fulenbach (SO).

Herr Ettlin bringt mehr als 20 Jahre Berufserfahrung im Elektrobereich mit und deckt sowohl klassische Elektroinstallationen in Haushalt und Industrie als auch Service-, Revisions- und Störungsarbeiten souverän ab. Besonders hervorzuheben ist seine sehr breite Erfahrung in Verdrahtungsarbeiten an Maschinen, Photovoltaik-Montagen, Messungen inkl. Berichterstellung sowie in der Organisation von Revisions- und Arbeitsabläufen.

===== BEISPIEL 3 (OHNE vorheriges Telefongespräch - Kaltakquise) =====
Betreff: Elektromonteur EFZ mit 10 Jahren Erfahrung (Region ZH)

Guten Tag

Gerne möchte ich Ihnen einen erfahrenen Elektromonteur vorstellen, der aktuell auf der Suche nach einer neuen Herausforderung ist.

Im Anhang finden Sie das Kurzprofil von Marco Weber, Elektromonteur EFZ, aus der Region 8400 Winterthur.

Herr Weber bringt über 10 Jahre Berufserfahrung in der Elektroinstallation mit. Er ist erfahren in Neu- und Umbauten, NIN-Prüfungen sowie Störungsbehebungen. Seine Arbeitsweise ist selbstständig, sauber und termintreu.

Dank Führerschein und eigenem Fahrzeug ist er flexibel einsetzbar. Eine Zusammenarbeit ist temporär, Try & Hire oder direkt fest möglich.

Falls Sie aktuell Bedarf haben, freue ich mich über eine kurze Rückmeldung.

Er arbeitet selbstständig, strukturiert und äusserst zuverlässig, ist belastbar und wird von Kunden wie auch Vorgesetzten als ruhiger, lösungsorientierter Fachmann geschätzt. Dank Führerschein und eigenem Fahrzeug ist er flexibel einsetzbar und sofort verfügbar.

Eine Zusammenarbeit ist temporär, Try & Hire oder direkt fest möglich.
Gerne organisiere ich bei Interesse kurzfristig ein persönliches Gespräch oder einen Einsatz.

Ich freue mich auf Ihre Rückmeldung bezüglich der nächsten Schritte.

=====

WICHTIG: Antworte NUR mit validem JSON in diesem Format:
{
  "subject": "Betreff hier",
  "body": "E-Mail-Text hier (ohne Anrede, die wird separat hinzugefügt)"
}

Kein Text vor oder nach dem JSON. Keine Markdown-Codeblöcke.`;

// Helper to extract text from PDF using unpdf (serverless-compatible)
async function extractPdfText(pdfUrl: string): Promise<string> {
  try {
    // Download PDF
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    // Use unpdf which is designed for serverless environments
    const { extractText } = await import("unpdf");
    const { text } = await extractText(arrayBuffer);

    // text is an array of strings (one per page), join them
    return Array.isArray(text) ? text.join("\n\n") : (text || "");
  } catch (err) {
    console.error("[AI Generate Email] PDF extraction error:", err);
    throw new Error(
      `PDF konnte nicht gelesen werden: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

// POST /api/ai/generate-email
// Body: { candidateId: string, contactId: string, mode?: "fast" | "best" }
export async function POST(request: NextRequest) {
  try {
    // Check for OpenAI API key
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

    // Parse request body
    const body = await request.json();
    const { candidateId, contactId, mode = "best" } = body;

    if (!candidateId || !contactId) {
      return respondError("candidateId and contactId are required", 400);
    }

    // Model selection based on mode
    // "fast" = gpt-4o-mini (quick, cheaper)
    // "best" = gpt-5-mini (higher quality, uses Responses API)
    const useGpt5 = mode === "best";
    const selectedModel = useGpt5 ? BEST_MODEL : FAST_MODEL;

    const adminSupabase = createAdminClient();

    // Fetch candidate
    const { data: candidate, error: candidateError } = await adminSupabase
      .from("tma_candidates")
      .select("id, first_name, last_name, position_title, canton, city, postal_code, short_profile_url, experience_level, driving_license, notes")
      .eq("id", candidateId)
      .single();

    if (candidateError || !candidate) {
      return respondError("Kandidat nicht gefunden", 404);
    }

    if (!candidate.short_profile_url) {
      return respondError("Kein Kurzprofil für diesen Kandidaten vorhanden", 400);
    }

    // Fetch contact (company)
    const { data: contact, error: contactError } = await adminSupabase
      .from("contacts")
      .select("id, company_name, contact_name, canton, city")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return respondError("Kontakt nicht gefunden", 404);
    }

    // Fetch first Ansprechperson for personalized greeting
    const { data: persons } = await adminSupabase
      .from("contact_persons")
      .select("first_name, last_name, gender")
      .eq("contact_id", contactId)
      .limit(1);

    const contactPerson = persons?.[0] ?? null;
    const ansprechperson = contactPerson
      ? `${contactPerson.first_name} ${contactPerson.last_name}`
      : null;

    // Check if there's a recent call log for this contact (within last 48 hours)
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);
    
    const { count: callLogCount } = await adminSupabase
      .from("contact_call_logs")
      .select("*", { count: "exact", head: true })
      .eq("contact_id", contactId)
      .gte("created_at", fortyEightHoursAgo.toISOString());

    const hasRecentCall = (callLogCount || 0) > 0;

    // Build Anrede
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

    // Extract text from PDF
    let pdfText: string;
    try {
      pdfText = await extractPdfText(candidate.short_profile_url);
    } catch (err) {
      return respondError(
        err instanceof Error ? err.message : "PDF konnte nicht gelesen werden",
        400
      );
    }

    // Limit PDF text to avoid token limits (approx 4000 chars = ~1000 tokens)
    const maxPdfLength = 6000;
    const truncatedPdfText =
      pdfText.length > maxPdfLength
        ? pdfText.substring(0, maxPdfLength) + "\n\n[... Kurzprofil gekürzt ...]"
        : pdfText;

    // Build user prompt with context about whether we called them
    const introContext = hasRecentCall
      ? "Es wurde kürzlich mit der Firma telefoniert. Verwende 'Wie kurz besprochen' oder 'Gemäss unserem Telefongespräch' als Einleitung."
      : "Es wurde NICHT mit der Firma telefoniert. Verwende 'Gerne möchte ich Ihnen' oder 'Ich würde Ihnen gerne einen Kandidaten vorstellen' als Einleitung. NICHT 'Wie besprochen' schreiben!";

    const subjectPrefix = hasRecentCall
      ? "Gemäss Telefongespräch – "
      : "";

    const userPrompt = `Erstelle eine E-Mail für folgende Situation:

FIRMA:
- Firmenname: ${contact.company_name}
- Ort: ${contact.city || contact.canton || "Schweiz"}

ANSPRECHPERSON:
${ansprechperson ? `- Name: ${ansprechperson}` : "- Keine Ansprechperson bekannt"}

KANDIDAT:
- Vollständiger Name: ${candidate.first_name} ${candidate.last_name}
- Position/Beruf: ${candidate.position_title || "Fachkraft"}
- Region: ${candidate.city ? `${candidate.postal_code || ""} ${candidate.city}`.trim() : (candidate.canton || "Schweiz")}
- Erfahrungslevel: ${candidate.experience_level || "nicht angegeben"}

WICHTIGER KONTEXT:
${introContext}

KURZPROFIL (extrahierter Text aus PDF):
${truncatedPdfText}

AUFGABE:
Schreibe eine E-Mail im exakt gleichen Stil wie die Beispiele oben.
- Betreff: "${subjectPrefix}[Position]" ${hasRecentCall ? "oder mit Regionskürzel" : "- Betreff sollte die Position/Beruf enthalten"}
- Body: Beginne mit "${anrede}" dann passende Einleitung (siehe WICHTIGER KONTEXT), Hauptteil mit Skills aus dem Kurzprofil, Flexibilität, Optionen, Call-to-Action

Antworte NUR mit JSON: {"subject": "...", "body": "..."}`;

    // Call OpenAI - different API based on mode
    const openai = getOpenAI();
    const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`;
    
    let responseText: string | undefined;
    
    try {
      if (useGpt5) {
        // GPT-5 uses Responses API
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
        
        if (!responseText) {
          console.error("[AI Email] GPT-5 empty response. Full response:", JSON.stringify(response));
        }
      } else {
        // GPT-4o-mini uses chat.completions API
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        });
        responseText = completion.choices[0]?.message?.content?.trim();
      }
    } catch (openaiError) {
      console.error("[AI Email] OpenAI API Error:", openaiError);
      const errorMessage = openaiError instanceof Error ? openaiError.message : "OpenAI API Fehler";
      return respondError(`OpenAI Fehler: ${errorMessage}`, 500);
    }

    // Log for monitoring
    console.log(`[AI Email] Model: ${selectedModel}, Mode: ${mode}, Response received`);
    console.log("[AI Email] Response:", responseText?.substring(0, 200));

    if (!responseText) {
      return respondError("AI konnte keine E-Mail generieren (leere Antwort)", 500);
    }

    // Parse JSON response
    let parsed: { subject: string; body: string };
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.subject || !parsed.body) {
        throw new Error("Missing subject or body in response");
      }
    } catch (parseErr) {
      console.error("[AI Generate Email] Parse error:", parseErr, "Response:", responseText);
      return respondError("AI-Antwort konnte nicht verarbeitet werden", 500);
    }

    return respondSuccess({
      subject: parsed.subject,
      body: parsed.body,
      candidateName: `${candidate.first_name} ${candidate.last_name}`,
      companyName: contact.company_name,
    });
  } catch (err) {
    console.error("[AI Generate Email] Error:", err);
    return respondError(
      err instanceof Error ? err.message : "E-Mail konnte nicht generiert werden",
      500
    );
  }
}

