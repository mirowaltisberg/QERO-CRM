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
 * Generate the XML for an inline image in DOCX
 * Size is in EMUs (English Metric Units): 1 inch = 914400 EMUs
 */
function generateImageXml(rId: string, widthPx: number, heightPx: number): string {
  // Convert pixels to EMUs (assuming 96 DPI)
  const widthEmu = Math.round(widthPx * 914400 / 96);
  const heightEmu = Math.round(heightPx * 914400 / 96);
  
  return `<w:r><w:rPr></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Photo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Photo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/**
 * Download an image from URL and return as base64
 * Handles both public URLs and Supabase Storage URLs
 */
async function downloadImageAsBase64(url: string): Promise<{ base64: string; extension: string }> {
  console.log("[DOCX] Fetching image from:", url);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  
  // Get content type to determine extension
  const contentType = response.headers.get("content-type") || "image/jpeg";
  let extension = "jpeg";
  if (contentType.includes("png")) extension = "png";
  else if (contentType.includes("gif")) extension = "gif";
  else if (contentType.includes("webp")) extension = "webp";
  else if (contentType.includes("jpeg") || contentType.includes("jpg")) extension = "jpeg";
  
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  
  console.log("[DOCX] Image downloaded:", buffer.byteLength, "bytes, type:", extension);
  
  return { base64, extension };
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
  
  // Download photo if provided
  let photoData: { base64: string; extension: string } | null = null;
  
  if (photoUrl) {
    try {
      console.log("[DOCX] Downloading photo from:", photoUrl);
      photoData = await downloadImageAsBase64(photoUrl);
      console.log("[DOCX] Photo downloaded successfully, size:", photoData.base64.length, "chars base64");
    } catch (err) {
      console.error("[DOCX] Failed to load photo, continuing without it:", err);
      photoData = null;
    }
  } else {
    console.log("[DOCX] No photo URL provided");
  }

  // Fix document.xml before processing
  let documentXml = zip.file("word/document.xml")?.asText();
  if (documentXml) {
    let fixedXml = documentXml;
    
    // FIRST: Remove proofErr elements - they break token merging
    fixedXml = fixedXml.replace(/<w:proofErr[^/]*\/>/g, "");
    console.log("[DOCX] Removed proofErr elements");
    
    // THEN: Fix split tokens (now that proofErr is gone)
    fixedXml = fixSplitTokensRobust(fixedXml);
    
    // Remove green borders (color 70AD47) - change to black
    fixedXml = fixedXml.replace(/w:color="70AD47"/g, 'w:color="000000"');
    console.log("[DOCX] Fixed green border color");
    
    // Remove the "Berufliche Erfahrung" paragraph that appears after the table
    // Match: </w:tbl> followed by paragraph containing "Berufliche Erfahrung"
    fixedXml = fixedXml.replace(
      /(<\/w:tbl>)<w:p[^>]*>[^]*?Berufliche Erfahrung<\/w:t>[^]*?<\/w:p>/,
      "$1"
    );
    console.log("[DOCX] Removed stray 'Berufliche Erfahrung' paragraph");
    
    // Handle photo: either embed image or remove placeholder
    if (photoData) {
      // Add image to media folder
      const imageFileName = `image_photo.${photoData.extension}`;
      const imagePath = `word/media/${imageFileName}`;
      zip.file(imagePath, Buffer.from(photoData.base64, "base64"));
      console.log("[DOCX] Added photo to media folder:", imagePath);
      
      // Add relationship for the image
      const relsPath = "word/_rels/document.xml.rels";
      let relsXml = zip.file(relsPath)?.asText() || "";
      
      // Find the highest rId and add a new one
      const rIdMatches = relsXml.match(/Id="rId(\d+)"/g) || [];
      const rIdNumbers = rIdMatches.map(m => parseInt(m.match(/\d+/)?.[0] || "0"));
      const nextRId = Math.max(...rIdNumbers, 0) + 1;
      const photoRId = `rId${nextRId}`;
      
      // Add new relationship before closing tag
      const newRel = `<Relationship Id="${photoRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageFileName}"/>`;
      relsXml = relsXml.replace("</Relationships>", `${newRel}</Relationships>`);
      zip.file(relsPath, relsXml);
      console.log("[DOCX] Added image relationship:", photoRId);
      
      // Replace [[photo]] with image XML
      // Find the paragraph containing [[photo]] and replace just the run
      const imageXml = generateImageXml(photoRId, 113, 150);
      
      // Replace the entire run containing [[photo]]
      fixedXml = fixedXml.replace(
        /<w:r[^>]*>(?:<[^>]*>)*<w:t[^>]*>\[\[photo\]\]<\/w:t>(?:<[^>]*>)*<\/w:r>/g,
        imageXml
      );
      
      // Also try simpler pattern if the above didn't match
      if (fixedXml.includes("[[photo]]")) {
        fixedXml = fixedXml.replace(/\[\[photo\]\]/g, "");
        console.log("[DOCX] Warning: Could not replace photo run, removed placeholder");
      } else {
        console.log("[DOCX] Replaced [[photo]] with image XML");
      }
    } else {
      // No photo - remove placeholder
      fixedXml = fixedXml.replace(/\[\[photo\]\]/g, "");
      console.log("[DOCX] Removed photo placeholder (no photo available)");
    }
    
    zip.file("word/document.xml", fixedXml);
    console.log("[DOCX] Fixed document.xml");
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
  
  // Photo is embedded directly in the XML, no template data needed
  
  console.log("[DOCX] Rendering template with data:", Object.keys(templateData));
  console.log("[DOCX] Photo embedded:", !!photoData);
  
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
