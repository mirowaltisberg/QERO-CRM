/**
 * DOCX Template Filling
 * Fills the Kurzprofil template with candidate data
 */

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { KurzprofilData } from "./schema";
import { TEMPLATE_BASE64 } from "./template-data";

/**
 * Robust token fixer using iterative approach
 * Merges split [[...]] tokens that Word may have split across XML runs
 */
function fixSplitTokensRobust(xml: string): string {
  // Extract all text content concatenated
  const textOnly = xml.replace(/<[^>]+>/g, "");
  
  // Find all [[...]] tokens in the concatenated text
  const tokens = textOnly.match(/\[\[[^\[\]]+\]\]/g) || [];
  
  // For each token, find where it appears (split or not) and fix
  let result = xml;
  
  for (const token of tokens) {
    const tokenName = token.slice(2, -2); // Remove [[ and ]]
    
    // Check if token already exists as-is
    if (result.includes(token)) continue;
    
    // Build a regex that matches the token split across tags
    // [[, token_name, ]] can each be in separate <w:t> tags
    const parts = token.split("");
    let pattern = "";
    for (const char of parts) {
      // Escape special regex chars
      const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pattern += escaped + "(?:</w:t>(?:<[^>]*>)*<w:t[^>]*>)?";
    }
    // Remove the trailing optional group
    pattern = pattern.slice(0, -"(?:</w:t>(?:<[^>]*>)*<w:t[^>]*>)?".length);
    
    try {
      const regex = new RegExp(pattern, "g");
      result = result.replace(regex, token);
    } catch {
      // If regex is invalid, skip this token
      console.warn(`[DOCX] Could not fix split token: ${token}`);
    }
  }
  
  return result;
}


/**
 * Fill the DOCX template with candidate data
 */
export async function fillDocxTemplate(
  data: KurzprofilData,
  photoUrl?: string | null
): Promise<Buffer> {
  console.log("[DOCX] Loading embedded template");
  
  // Load template from embedded base64
  const templateBuffer = Buffer.from(TEMPLATE_BASE64, "base64");
  const zip = new PizZip(templateBuffer);
  
  // Note: Photo embedding is temporarily disabled due to DOCX complexity
  // The [[photo]] placeholder will be removed from the output
  if (photoUrl) {
    console.log("[DOCX] Photo URL provided but embedding is temporarily disabled:", photoUrl);
  }

  // XML fixes for LibreOffice compatibility
  const documentXml = zip.file("word/document.xml")?.asText();
  if (documentXml) {
    let fixedXml = documentXml;
    
    // 1. Remove proofErr elements (spell check markers) - they break token merging
    fixedXml = fixedXml.replace(/<w:proofErr[^/]*\/>/g, "");
    
    // 2. Fix split tokens (Word splits [[token]] across multiple XML runs)
    fixedXml = fixSplitTokensRobust(fixedXml);
    
    // 3. Remove [[photo]] placeholder (photo embedding not yet implemented)
    fixedXml = fixedXml.replace(/\[\[photo\]\]/g, "");
    
    // 4. Fix green border color (70AD47 -> black)
    fixedXml = fixedXml.replace(/w:color="70AD47"/g, 'w:color="000000"');
    
    // 5. Remove table positioning (w:tblpPr) - causes LibreOffice to reflow content
    // This makes tables flow normally instead of being positioned/floating
    fixedXml = fixedXml.replace(/<w:tblpPr[^/]*\/>/g, "");
    fixedXml = fixedXml.replace(/<w:tblpPr[^>]*>.*?<\/w:tblpPr>/g, "");
    
    zip.file("word/document.xml", fixedXml);
    console.log("[DOCX] Preprocessed document.xml (fixed colors, removed table positioning)");
  }
  
  // Create docxtemplater instance (image is embedded directly, no module needed)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "[[", end: "]]" },
  });
  
  // Prepare template data
  const templateData: Record<string, string> = {
    name_vorname: data.name_vorname,
    alter_geschlecht: data.alter_geschlecht,
    region: data.region,
    fuehrerschein: data.fuehrerschein,
    fahrzeug: data.fahrzeug,
    nationalitaeten: data.nationalitaeten,
    beruf: data.beruf,
    faehigkeiten_bullets: data.faehigkeiten_bullets,
    berufliche_erfahrung_text: data.berufliche_erfahrung_text,
    anstellungsart: data.anstellungsart,
    verfuegbar_ab: data.verfuegbar_ab,
    kontaktperson: data.kontaktperson,
    // Fixed value - never show actual salary
    salaer_tarif: "Nach Vereinbarung",
  };
  
  console.log("[DOCX] Rendering template with data:", Object.keys(templateData));
  
  // Render the document
  try {
    doc.render(templateData);
    console.log("[DOCX] Render completed successfully");
  } catch (renderErr) {
    console.error("[DOCX] Render error:", renderErr);
    throw renderErr;
  }
  
  // Generate output
  const output = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  
  console.log("[DOCX] Template filled successfully, output size:", output.length, "bytes");
  
  return output;
}

/**
 * Fill template and return as base64 string (for API responses)
 */
export async function fillDocxTemplateBase64(
  data: KurzprofilData,
  photoUrl?: string | null
): Promise<string> {
  const buffer = await fillDocxTemplate(data, photoUrl);
  return buffer.toString("base64");
}
