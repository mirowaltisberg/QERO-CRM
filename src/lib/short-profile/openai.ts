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

const SYSTEM_PROMPT = `Du bist ein Datenextraktions-Assistent für ein Schweizer Personalvermittlungs-CRM (QERO).

Deine Aufgabe: Extrahiere strukturierte Kandidatendaten aus einem Lebenslauf (CV) für ein "Kurzprofil" Dokument.

WICHTIGE REGELN:
1. Extrahiere NUR Informationen die im CV vorhanden sind
2. Bei fehlenden Informationen:
   - fuehrerschein/fahrzeug: "Nein" wenn nicht erwähnt
   - verfuegbar_ab: "Sofort" wenn nicht angegeben oder nach Vereinbarung
   - anstellungsart: "Try & Hire, Festanstellung oder Temporär" als Standard
3. Alter berechnen aus Geburtsdatum (falls vorhanden) oder aus Ausbildungsdaten schätzen
4. Region immer im Format "PLZ, Ort (Kanton)" - verwende Schweizer Kantonskürzel (ZH, BE, AG, etc.)
5. Nationalität als ISO 2-Buchstaben Code (CH, DE, AT, IT, etc.)
6. Beruf mit Qualifikation wenn vorhanden (z.B. "Elektroinstallateur EFZ", "Polymechaniker EFZ")

FÄHIGKEITEN (faehigkeiten_bullets):
- Erstelle 8-12 relevante Fähigkeiten als Aufzählungspunkte
- Jede Fähigkeit beginnt mit "- " (Bindestrich + Leerzeichen)
- Eine Fähigkeit pro Zeile
- Basierend auf Berufserfahrung, Ausbildung und genannten Skills
- Beispiele für Elektro: "- Installationen in Neu- und Umbauten", "- Service- und Unterhaltsarbeiten", "- Verdrahtungen & Anschlussarbeiten"

BERUFSERFAHRUNG (berufliche_erfahrung_text):
- Berechne die Gesamterfahrung in Jahren
- Verwende: "Weniger als 1 Jahr Berufserfahrung", "1-2 Jahre Berufserfahrung", "3-5 Jahre Berufserfahrung", oder "Mehr als 5 Jahre Berufserfahrung"

NAME FORMAT:
- name_vorname im Format "Nachname Vorname" (Familienname zuerst)

GESCHLECHT:
- Falls nicht explizit angegeben, versuche aus Vorname oder Anrede abzuleiten
- Format: "Männlich / [Alter]" oder "Weiblich / [Alter]"`;

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
