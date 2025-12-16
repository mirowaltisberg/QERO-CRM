/**
 * OpenAI Kurzprofil Generation
 * Extracts structured candidate data from CV text
 */

import OpenAI from "openai";
import { z } from "zod";
import { CvExtractionSchema, OPENAI_EXTRACTION_SCHEMA, type CvExtractionData } from "./schema";

// Model for extraction - gpt-4o-mini is fast and cost-effective for structured extraction
const EXTRACTION_MODEL = process.env.KURZPROFIL_MODEL ?? "gpt-4o-mini";

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

const SYSTEM_PROMPT = `Du bist ein KI-Rekrutierungsassistent für QERO AG.
Deine einzige Aufgabe ist es, Kurzprofile für Schweizer Fachkräfte-Kandidaten aus hochgeladenen Lebensläufen zu generieren.

AUSGABE-REGELN (NICHT VERHANDELBAR)

1. Nur Kurzprofil.
   Gib niemals einen vollständigen Lebenslauf, CV, Zeugnisse, Referenzen oder lange Biographie aus.

2. Sprache: Deutsch (CH). Professioneller, neutraler Recruiting-Ton. Kein Marketing-Geschwätz.

3. Kein Gehalt.
   Erwähne niemals Salär, Tarif, Lohn, GAV, Stundenansatz.

4. Keine Agenturen.
   Erwähne niemals andere Temporärfirmen oder Vermittler.

TITEL-REGELN (beruf)
- Wenn der Kandidat eine Lehre abgeschlossen hat: Verwende den EFZ / Gesellenbrief Titel als Haupttitel.
- Beispiel: "Elektroinstallateur EFZ"
- Füge KEINE Weiterbildungen (Technischer Kaufmann, HF, etc.) im Titel hinzu.

BERUFLICHE ERFAHRUNG REGELN (berufliche_erfahrung_text)
- Zähle NUR Erfahrung nach der Lehre.
- Verwende NUR diese standardisierten Phrasen:
  • "Weniger als 1 Jahr Berufserfahrung"
  • "Mehr als 1 Jahr Berufserfahrung"
  • "Mehr als 2 Jahre Berufserfahrung"
  • "Mehr als 3 Jahre Berufserfahrung"
  • "Mehr als 4 Jahre Berufserfahrung"
  • "Mehr als 5 Jahre Berufserfahrung"
  • etc.
- Wenn der Kandidat viele Jahre bei einer Firma gearbeitet hat, erwähne dies explizit in Fähigkeiten.

REGION REGELN
- Format STRIKT: PLZ Ort (Kanton)
- Beispiel: "8623 Wetzikon (ZH)"
- KEIN Komma nach PLZ!

FÄHIGKEITEN REGELN (faehigkeiten_bullets)
- Nur Aufzählungspunkte (jede Zeile beginnt mit "- ")
- Inkludiere:
  • Kernfähigkeiten aus dem CV
  • Tools, Systeme, Methoden relevant für das Handwerk
  • Typische Branchenfähigkeiten auch wenn nicht explizit genannt, wenn logisch impliziert
- NIEMALS inkludieren:
  • Windows
  • Microsoft Office
  • SAP
  • Sprachen

NAME FORMAT
- name_vorname im Format "Nachname Vorname" (Familienname zuerst)

GESCHLECHT/ALTER (alter_geschlecht)
- Falls nicht explizit angegeben, versuche aus Vorname oder Anrede abzuleiten
- Format: "Männlich / [Alter]" oder "Weiblich / [Alter]"

STANDARDWERTE
- fuehrerschein/fahrzeug: "Nein" wenn nicht erwähnt
- verfuegbar_ab: "Sofort" wenn nicht angegeben oder nach Vereinbarung
- anstellungsart: "Try & Hire, Festanstellung oder Temporär" als Standard
- nationalitaeten: ISO 2-Buchstaben Code (CH, DE, AT, IT, etc.)`;

/**
 * Generate Kurzprofil data from CV text using OpenAI
 */
export async function generateKurzprofilFromCv(cvText: string): Promise<CvExtractionData> {
  const openai = getOpenAI();
  
  console.log("[Kurzprofil AI] Generating structured data from CV text (" + cvText.length + " chars)");
  
  const response = await openai.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { 
        role: "user", 
        content: `Extrahiere die Kandidatendaten aus diesem Lebenslauf:\n\n${cvText}` 
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "kurzprofil_extraction",
        strict: true,
        schema: OPENAI_EXTRACTION_SCHEMA,
      },
    },
    temperature: 0.3, // Lower temperature for more consistent extraction
    max_tokens: 2000,
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty response");
  }
  
  console.log("[Kurzprofil AI] Received response, parsing JSON...");
  
  // Parse and validate with zod
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("[Kurzprofil AI] Failed to parse JSON:", content);
    throw new Error("OpenAI returned invalid JSON");
  }
  
  const validated = CvExtractionSchema.safeParse(parsed);
  if (!validated.success) {
    console.error("[Kurzprofil AI] Validation failed:", validated.error.issues);
    
    // Try to repair with a follow-up call
    console.log("[Kurzprofil AI] Attempting repair...");
    return repairExtraction(openai, content, validated.error.issues);
  }
  
  console.log("[Kurzprofil AI] Extraction successful");
  return validated.data;
}

/**
 * Attempt to repair invalid extraction with a follow-up call
 */
async function repairExtraction(
  openai: OpenAI,
  originalJson: string,
  issues: z.ZodIssue[]
): Promise<CvExtractionData> {
  const errorList = issues.map(e => `- ${e.path.join(".")}: ${e.message}`).join("\n");
  
  const response = await openai.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { 
        role: "user", 
        content: `Das folgende JSON hat Validierungsfehler. Bitte korrigiere es:\n\nOriginal JSON:\n${originalJson}\n\nFehler:\n${errorList}\n\nGib das korrigierte JSON zurück.` 
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "kurzprofil_extraction",
        strict: true,
        schema: OPENAI_EXTRACTION_SCHEMA,
      },
    },
    temperature: 0.1,
    max_tokens: 2000,
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI repair returned empty response");
  }
  
  const parsed = JSON.parse(content);
  const validated = CvExtractionSchema.safeParse(parsed);
  
  if (!validated.success) {
    console.error("[Kurzprofil AI] Repair failed:", validated.error.issues);
    throw new Error("Failed to extract valid data from CV after repair attempt");
  }
  
  console.log("[Kurzprofil AI] Repair successful");
  return validated.data;
}
