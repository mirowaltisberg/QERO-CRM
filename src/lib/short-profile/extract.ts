/**
 * CV Text Extraction
 * Extracts text from PDF files for AI processing
 */

import { extractText } from "unpdf";

// Maximum characters to send to OpenAI (to control cost and context window)
const MAX_EXTRACTED_CHARS = 15000;

/**
 * Download a file from a URL and return as ArrayBuffer
 */
async function downloadFile(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

/**
 * Normalize extracted text:
 * - Collapse multiple whitespace/newlines
 * - Trim
 * - Cap to max length
 */
function normalizeText(text: string, maxChars: number = MAX_EXTRACTED_CHARS): string {
  return text
    .replace(/\r\n/g, "\n")           // Normalize line endings
    .replace(/\n{3,}/g, "\n\n")       // Collapse 3+ newlines to 2
    .replace(/[ \t]+/g, " ")          // Collapse multiple spaces/tabs
    .replace(/\n /g, "\n")            // Remove leading spaces after newlines
    .trim()
    .slice(0, maxChars);
}

/**
 * Extract text from a PDF file URL
 */
export async function extractTextFromPdfUrl(pdfUrl: string): Promise<string> {
  console.log("[CV Extract] Downloading PDF from:", pdfUrl);
  
  const buffer = await downloadFile(pdfUrl);
  const uint8Array = new Uint8Array(buffer);
  
  console.log("[CV Extract] PDF size:", uint8Array.length, "bytes");
  
  // Extract text using unpdf
  const { text, totalPages } = await extractText(uint8Array, { mergePages: true });
  
  console.log("[CV Extract] Extracted", text.length, "chars from", totalPages, "pages");
  
  const normalized = normalizeText(text);
  
  console.log("[CV Extract] Normalized to", normalized.length, "chars");
  
  if (normalized.length < 100) {
    throw new Error("PDF appears to be empty or contains mostly images. Text extraction failed.");
  }
  
  return normalized;
}

/**
 * Detect file type from URL
 */
export function getFileTypeFromUrl(url: string): "pdf" | "docx" | "unknown" {
  const lower = url.toLowerCase();
  if (lower.includes(".pdf")) return "pdf";
  if (lower.includes(".docx") || lower.includes(".doc")) return "docx";
  return "unknown";
}

/**
 * Extract text from CV URL (PDF supported, DOCX could be added later)
 */
export async function extractCvText(cvUrl: string): Promise<string> {
  const fileType = getFileTypeFromUrl(cvUrl);
  
  if (fileType === "pdf") {
    return extractTextFromPdfUrl(cvUrl);
  }
  
  if (fileType === "docx") {
    // DOCX extraction could be added with mammoth or similar
    // For now, throw an error
    throw new Error("DOCX extraction not yet implemented. Please upload a PDF version of the CV.");
  }
  
  throw new Error(`Unsupported file type. Please upload a PDF file.`);
}
