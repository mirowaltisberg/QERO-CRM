import { z } from "zod";

/**
 * Kurzprofil JSON Schema
 * Matches the DOCX template tokens: [[field_name]]
 * 
 * Template tokens:
 * - [[name_vorname]] - Full name "Nachname Vorname" format
 * - [[alter_geschlecht]] - "Männlich / 25" or "Weiblich / 30"
 * - [[region]] - "PLZ, Ort (Kanton)" e.g. "8408, Winterthur (ZH)"
 * - [[beruf]] - Job title e.g. "Elektroinstallateur EFZ"
 * - [[fuehrerschein]] - "Ja" or "Nein"
 * - [[fahrzeug]] - "Ja" or "Nein"
 * - [[nationalitaeten]] - Country codes e.g. "CH" or "CH, DE"
 * - [[faehigkeiten_bullets]] - Skills as bullet list (hyphen-prefixed lines)
 * - [[berufliche_erfahrung_text]] - Experience description
 * - [[anstellungsart]] - Employment type preferences
 * - [[verfuegbar_ab]] - Availability date e.g. "Januar 2026" or "Sofort"
 * - [[kontaktperson]] - Contact person with phone/email
 * - [[photo]] - Replaced with image (not in JSON schema)
 */

export const KurzprofilSchema = z.object({
  // Personal info
  name_vorname: z.string().describe("Full name in 'Nachname Vorname' format"),
  alter_geschlecht: z.string().describe("Gender and age, e.g. 'Männlich / 25' or 'Weiblich / 30'"),
  region: z.string().describe("Location as 'PLZ Ort (Kanton)', e.g. '8623 Wetzikon (ZH)' - NO comma!"),
  
  // Documents/licenses
  fuehrerschein: z.enum(["Ja", "Nein"]).describe("Has driving license: 'Ja' or 'Nein'"),
  fahrzeug: z.enum(["Ja", "Nein"]).describe("Has own vehicle: 'Ja' or 'Nein'"),
  nationalitaeten: z.string().describe("Nationality codes, e.g. 'CH' or 'CH, DE'"),
  
  // Professional info
  beruf: z.string().describe("Job title/profession, e.g. 'Elektroinstallateur EFZ'"),
  faehigkeiten_bullets: z.string().describe("Skills as bullet list with hyphen prefix, each on new line. E.g.:\n- Installationen in Neu- und Umbauten\n- Service- und Unterhaltsarbeiten"),
  berufliche_erfahrung_text: z.string().describe("Experience level description, e.g. 'Weniger als 1 Jahr Berufserfahrung' or '3-5 Jahre Berufserfahrung'"),
  
  // Availability
  anstellungsart: z.string().describe("Employment type preferences, e.g. 'Try & Hire, Festanstellung oder Temporär'"),
  verfuegbar_ab: z.string().describe("Available from date, e.g. 'Januar 2026' or 'Sofort'"),
  
  // Contact (will be filled from current user, not extracted from CV)
  kontaktperson: z.string().describe("Contact person info with name, phone, email"),
});

export type KurzprofilData = z.infer<typeof KurzprofilSchema>;

/**
 * Schema for OpenAI extraction (subset - excludes kontaktperson which comes from user)
 */
export const CvExtractionSchema = z.object({
  name_vorname: z.string(),
  alter_geschlecht: z.string(),
  region: z.string(),
  fuehrerschein: z.enum(["Ja", "Nein"]),
  fahrzeug: z.enum(["Ja", "Nein"]),
  nationalitaeten: z.string(),
  beruf: z.string(),
  faehigkeiten_bullets: z.string(),
  berufliche_erfahrung_text: z.string(),
  anstellungsart: z.string(),
  verfuegbar_ab: z.string(),
});

export type CvExtractionData = z.infer<typeof CvExtractionSchema>;

/**
 * OpenAI JSON Schema for structured output (used in API call)
 */
export const OPENAI_EXTRACTION_SCHEMA = {
  type: "object" as const,
  properties: {
    name_vorname: {
      type: "string",
      description: "Full name in 'Nachname Vorname' format (family name first)",
    },
    alter_geschlecht: {
      type: "string", 
      description: "Gender and age formatted as 'Männlich / 25' or 'Weiblich / 30'. If age unknown, estimate from education dates.",
    },
    region: {
      type: "string",
      description: "Location formatted as 'PLZ Ort (Kanton)', e.g. '8623 Wetzikon (ZH)'. NO comma after PLZ! Use Swiss canton abbreviation.",
    },
    fuehrerschein: {
      type: "string",
      enum: ["Ja", "Nein"],
      description: "Has driving license. Default to 'Nein' if not mentioned.",
    },
    fahrzeug: {
      type: "string",
      enum: ["Ja", "Nein"],
      description: "Has own vehicle. Default to 'Nein' if not mentioned.",
    },
    nationalitaeten: {
      type: "string",
      description: "Nationality as country code(s), e.g. 'CH' or 'CH, DE'. Use ISO 2-letter codes.",
    },
    beruf: {
      type: "string",
      description: "Primary job title from apprenticeship (EFZ/Gesellenbrief) ONLY. Example: 'Elektroinstallateur EFZ'. Do NOT include further education (Technischer Kaufmann, HF, etc.)",
    },
    faehigkeiten_bullets: {
      type: "string",
      description: "Skills as hyphen-prefixed bullet list. Each on new line starting with '- '. Include core job skills, tools, systems, methods. NEVER include: Windows, Microsoft Office, SAP, or Languages.",
    },
    berufliche_erfahrung_text: {
      type: "string",
      description: "Post-apprenticeship experience only. Use EXACTLY: 'Weniger als 1 Jahr Berufserfahrung', 'Mehr als 1 Jahr Berufserfahrung', 'Mehr als 2 Jahre Berufserfahrung', 'Mehr als 3 Jahre Berufserfahrung', etc.",
    },
    anstellungsart: {
      type: "string",
      description: "Employment preferences. Use 'Try & Hire, Festanstellung oder Temporär' if not specified.",
    },
    verfuegbar_ab: {
      type: "string",
      description: "Available from. Use German month names, e.g. 'Januar 2026', or 'Sofort' if immediately available.",
    },
  },
  required: [
    "name_vorname",
    "alter_geschlecht", 
    "region",
    "fuehrerschein",
    "fahrzeug",
    "nationalitaeten",
    "beruf",
    "faehigkeiten_bullets",
    "berufliche_erfahrung_text",
    "anstellungsart",
    "verfuegbar_ab",
  ],
  additionalProperties: false,
};
