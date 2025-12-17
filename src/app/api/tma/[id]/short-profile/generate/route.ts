import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { extractCvText } from "@/lib/short-profile/extract";
import { generateKurzprofilFromCv } from "@/lib/short-profile/openai";
import { fillDocxTemplate } from "@/lib/short-profile/docx";
import { convertToPdf } from "@/lib/short-profile/pdf-convert";
import type { KurzprofilData } from "@/lib/short-profile/schema";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tma/[id]/short-profile/generate
 * 
 * Generates a Kurzprofil PDF from the candidate's CV:
 * 1. Extract text from CV (PDF)
 * 2. Use OpenAI to extract structured data
 * 3. Fill the DOCX template with the data
 * 4. Convert DOCX to PDF
 * 5. Upload PDF to Supabase Storage
 * 6. Update candidate record with short_profile_url
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: candidateId } = await context.params;

  try {
    const supabase = await createClient();

    // Get current user for contact person info
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Get user profile for contact person details
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    // Get candidate data
    const { data: candidate, error: candidateError } = await supabase
      .from("tma_candidates")
      .select("*")
      .eq("id", candidateId)
      .single();

    if (candidateError || !candidate) {
      return respondError("Candidate not found", 404);
    }

    // Check if CV exists
    if (!candidate.cv_url) {
      return respondError("No CV uploaded for this candidate. Please upload a CV first.", 400);
    }

    console.log(`[Kurzprofil Generate] Starting for candidate ${candidateId}`);

    // Step 1: Extract text from CV
    console.log("[Kurzprofil Generate] Step 1: Extracting CV text...");
    let cvText: string;
    try {
      cvText = await extractCvText(candidate.cv_url);
    } catch (err) {
      console.error("[Kurzprofil Generate] CV extraction failed:", err);
      return respondError(
        `Failed to extract text from CV: ${err instanceof Error ? err.message : "Unknown error"}`,
        400
      );
    }

    // Step 2: Generate structured data using OpenAI
    console.log("[Kurzprofil Generate] Step 2: Generating structured data with AI...");
    let extractedData;
    try {
      extractedData = await generateKurzprofilFromCv(cvText);
    } catch (err) {
      console.error("[Kurzprofil Generate] AI extraction failed:", err);
      return respondError(
        `Failed to extract candidate data: ${err instanceof Error ? err.message : "Unknown error"}`,
        500
      );
    }

    // Build full Kurzprofil data with contact person
    const kontaktperson = profile
      ? `${profile.full_name}\nTel. 058 510 57 64 / ${profile.email}`
      : "QERO AG\nTel. 058 510 57 57 / info@qero.ch";

    const kurzprofilData: KurzprofilData = {
      ...extractedData,
      kontaktperson,
    };

    // Step 3: Fill DOCX template
    console.log("[Kurzprofil Generate] Step 3: Filling DOCX template...");
    console.log("[Kurzprofil Generate] Photo URL:", candidate.photo_url || "(none)");
    let docxBuffer: Buffer;
    try {
      docxBuffer = await fillDocxTemplate(kurzprofilData, candidate.photo_url);
      console.log("[Kurzprofil Generate] DOCX filled, size:", docxBuffer.length, "bytes");
    } catch (err) {
      console.error("[Kurzprofil Generate] Template filling failed:", err);
      return respondError(
        `Failed to fill template: ${err instanceof Error ? err.message : "Unknown error"}`,
        500
      );
    }

    // Step 4: Convert DOCX to PDF
    console.log("[Kurzprofil Generate] Step 4: Converting to PDF...");
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await convertToPdf(docxBuffer);
    } catch (err) {
      console.error("[Kurzprofil Generate] PDF conversion failed:", err);
      return respondError(
        `Failed to convert to PDF: ${err instanceof Error ? err.message : "Unknown error"}`,
        500
      );
    }

    // Step 5: Upload PDF to Supabase Storage
    console.log("[Kurzprofil Generate] Step 5: Uploading PDF to storage...");
    const fileName = `${candidateId}/kurzprofil-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("tma-docs")
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[Kurzprofil Generate] Upload failed:", uploadError);
      return respondError(`Failed to upload PDF: ${uploadError.message}`, 500);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("tma-docs").getPublicUrl(fileName);

    // Step 6: Update candidate record
    console.log("[Kurzprofil Generate] Step 6: Updating candidate record...");
    const { error: updateError } = await supabase
      .from("tma_candidates")
      .update({ short_profile_url: urlData.publicUrl })
      .eq("id", candidateId);

    if (updateError) {
      console.error("[Kurzprofil Generate] Update failed:", updateError);
      return respondError(`Failed to update candidate: ${updateError.message}`, 500);
    }

    console.log(`[Kurzprofil Generate] Success! PDF URL: ${urlData.publicUrl}`);

    return respondSuccess({
      short_profile_url: urlData.publicUrl,
      extracted_data: kurzprofilData,
    });
  } catch (error) {
    console.error(`[Kurzprofil Generate] Unexpected error:`, error);
    return respondError(
      error instanceof Error ? error.message : "Failed to generate Kurzprofil",
      500
    );
  }
}
