/**
 * DOCX Template Filling
 * Fills the Kurzprofil template with candidate data
 */

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import type { KurzprofilData } from "./schema";
import { TEMPLATE_BASE64 } from "./template-data";

/**
 * Pre-process XML to merge split tokens across runs
 * Word often splits [[token]] into multiple <w:t> elements like [[, token, ]]
 * This function merges them back together
 */
function mergeSplitTokens(xml: string): string {
  // Pattern: finds sequences of <w:t> elements that together form [[...]]
  // Strategy: find all text content, merge tokens, then reconstruct
  
  // First, let's do a simpler approach: replace the content while preserving structure
  // Find patterns like </w:t>...</w:t> where the combined text forms a token
  
  // Extract all <w:t>...</w:t> content and their positions
  const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  
  // Build a map of text runs
  const runs: { match: string; text: string; start: number; end: number }[] = [];
  let match;
  while ((match = textPattern.exec(xml)) !== null) {
    runs.push({
      match: match[0],
      text: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  
  // Now find sequences that form [[...]] patterns
  let result = xml;
  let offset = 0;
  
  for (let i = 0; i < runs.length; i++) {
    // Look for [[ at the start
    if (!runs[i].text.includes("[[")) continue;
    
    // Find where ]] ends
    let combined = runs[i].text;
    let endIdx = i;
    
    while (!combined.includes("]]") && endIdx < runs.length - 1) {
      endIdx++;
      combined += runs[endIdx].text;
    }
    
    if (!combined.includes("]]")) continue;
    
    // Check if we have a valid token
    const tokenMatch = combined.match(/\[\[([^\[\]]+)\]\]/);
    if (!tokenMatch) continue;
    
    // If the token spans multiple runs, we need to merge them
    if (endIdx > i) {
      // Find the actual XML span from first run start to last run end
      const spanStart = runs[i].start + offset;
      const spanEnd = runs[endIdx].end + offset;
      const originalSpan = result.slice(spanStart, spanEnd);
      
      // Create a single run with the complete token
      // Find the first <w:t> tag and use it as the template
      const firstTMatch = originalSpan.match(/<w:t[^>]*>/);
      if (firstTMatch) {
        // Replace just the text content, keeping the structure simple
        // We'll put all the text in the first run's <w:t> and empty the rest
        const newSpan = originalSpan.replace(
          /(<w:t[^>]*>)[^<]*(<\/w:t>)/g, 
          (fullMatch, openTag, closeTag, idx) => {
            // First occurrence gets all the text, rest get empty
            if (idx === 0 || fullMatch === originalSpan.match(/<w:t[^>]*>[^<]*<\/w:t>/)?.[0]) {
              return `${openTag}${combined}${closeTag}`;
            }
            return `${openTag}${closeTag}`;
          }
        );
        
        // Actually, let's do a simpler replacement
        // Just replace the entire span with a single run containing the merged text
        const newContent = originalSpan.replace(
          /<w:t[^>]*>[^<]*<\/w:t>/g,
          ""
        ).replace(
          /(<w:r[^>]*>)/, 
          `$1<w:t>${combined}</w:t>`
        );
        
        // Skip this complex approach for now - docxtemplater should handle it
      }
    }
  }
  
  return result;
}

/**
 * Simple token merger that works at the string level
 * Joins adjacent text runs that form split [[...]] patterns
 */
function fixSplitTokensSimple(xml: string): string {
  // Replace patterns where [[ and ]] are split across tags
  // Pattern: ]]</w:t>...<w:t>...[[  should become whole tokens
  
  // Step 1: Find all potential token fragments and rebuild
  let result = xml;
  
  // Handle common split patterns:
  // [[</w:t>...<w:t>name</w:t>...<w:t>]]
  // We need to identify these and merge them
  
  // First, let's try a regex that finds broken tokens
  // This matches: [[ (possibly across tags) token_name (possibly across tags) ]]
  
  // Simpler approach: remove tags between [[ and ]] within reasonable distance
  const brokenTokenPattern = /\[\[(<\/w:t>.*?<w:t[^>]*>)*([a-z_]+)(<\/w:t>.*?<w:t[^>]*>)*\]\]/gi;
  
  result = result.replace(brokenTokenPattern, (match, _p1, tokenName, _p2) => {
    return `[[${tokenName}]]`;
  });
  
  return result;
}

/**
 * More robust token fixer using iterative approach
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
 * Download an image from URL and return as base64
 */
async function downloadImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

/**
 * Get image dimensions from base64 data
 * Returns approximate dimensions for common image formats
 */
function getImageSize(base64: string): { width: number; height: number } {
  // Default size for profile photo (matching template photo box)
  // The template has a photo box approximately 107x167 points (based on screenshot)
  return { width: 150, height: 200 };
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
  
  // Fix split tokens in document.xml before processing
  const documentXml = zip.file("word/document.xml")?.asText();
  if (documentXml) {
    const fixedXml = fixSplitTokensRobust(documentXml);
    zip.file("word/document.xml", fixedXml);
    console.log("[DOCX] Fixed split tokens in document.xml");
  }
  
  // Configure image module if we have a photo
  let imageModule: ImageModule | null = null;
  let photoBase64: string | null = null;
  
  if (photoUrl) {
    try {
      console.log("[DOCX] Downloading photo from:", photoUrl);
      photoBase64 = await downloadImageAsBase64(photoUrl);
      
      imageModule = new ImageModule({
        centered: false,
        getImage: (tagValue: string) => {
          if (tagValue === "photo" && photoBase64) {
            return Buffer.from(photoBase64, "base64");
          }
          throw new Error(`Unknown image tag: ${tagValue}`);
        },
        getSize: () => {
          // Size in pixels (will be converted to EMUs by the module)
          return [150, 200];
        },
      });
    } catch (err) {
      console.error("[DOCX] Failed to load photo, continuing without it:", err);
    }
  }
  
  // Create docxtemplater instance
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "[[", end: "]]" },
    modules: imageModule ? [imageModule] : [],
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
  
  // Add photo placeholder if we have an image (for image module)
  // If no photo, set to empty string to remove the placeholder
  if (photoBase64 && imageModule) {
    templateData.photo = "photo";
  } else {
    templateData.photo = ""; // Remove [[photo]] placeholder when no photo
  }
  
  console.log("[DOCX] Rendering template with data...");
  
  // Render the document
  doc.render(templateData);
  
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
