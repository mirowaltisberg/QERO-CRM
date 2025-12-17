/**
 * DOCX to PDF Conversion
 * Uses Gotenberg (self-hosted) for reliable conversion
 * Fallback to CloudConvert or ConvertAPI if configured
 */

// Gotenberg instance on Railway
const GOTENBERG_URL = process.env.GOTENBERG_URL || "https://gotenberggotenberg8-production-f07f.up.railway.app";

// Legacy API keys (fallback)
const CLOUDCONVERT_API_KEY = process.env.CLOUDCONVERT_API_KEY;
const CLOUDCONVERT_API_URL = "https://api.cloudconvert.com/v2";

interface CloudConvertJob {
  id: string;
  status: string;
  tasks: {
    id: string;
    name: string;
    operation: string;
    status: string;
    result?: {
      files?: { url: string; filename: string }[];
    };
  }[];
}

/**
 * Convert DOCX buffer to PDF using CloudConvert
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  if (!CLOUDCONVERT_API_KEY) {
    throw new Error("CLOUDCONVERT_API_KEY not configured. Please set this environment variable.");
  }

  console.log("[PDF Convert] Starting CloudConvert job...");

  // Step 1: Create a job with import, convert, and export tasks
  const createJobResponse = await fetch(`${CLOUDCONVERT_API_URL}/jobs`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CLOUDCONVERT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tasks: {
        "import-docx": {
          operation: "import/base64",
          file: docxBuffer.toString("base64"),
          filename: "document.docx",
        },
        "convert-to-pdf": {
          operation: "convert",
          input: ["import-docx"],
          output_format: "pdf",
          engine: "office",
        },
        "export-pdf": {
          operation: "export/url",
          input: ["convert-to-pdf"],
          inline: false,
          archive_multiple_files: false,
        },
      },
      tag: "kurzprofil",
    }),
  });

  if (!createJobResponse.ok) {
    const error = await createJobResponse.text();
    console.error("[PDF Convert] Failed to create job:", error);
    throw new Error(`CloudConvert job creation failed: ${createJobResponse.status}`);
  }

  const job = (await createJobResponse.json()).data as CloudConvertJob;
  console.log("[PDF Convert] Job created:", job.id);

  // Step 2: Wait for job completion (poll every 2 seconds, max 60 seconds)
  const maxWaitTime = 60000;
  const pollInterval = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const statusResponse = await fetch(`${CLOUDCONVERT_API_URL}/jobs/${job.id}`, {
      headers: {
        "Authorization": `Bearer ${CLOUDCONVERT_API_KEY}`,
      },
    });

    if (!statusResponse.ok) {
      throw new Error(`Failed to check job status: ${statusResponse.status}`);
    }

    const statusData = (await statusResponse.json()).data as CloudConvertJob;
    console.log("[PDF Convert] Job status:", statusData.status);

    if (statusData.status === "finished") {
      // Find the export task result
      const exportTask = statusData.tasks.find(t => t.name === "export-pdf");
      const pdfUrl = exportTask?.result?.files?.[0]?.url;

      if (!pdfUrl) {
        throw new Error("No PDF URL in job result");
      }

      console.log("[PDF Convert] Downloading PDF...");
      
      // Download the PDF
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
      }

      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      console.log("[PDF Convert] PDF downloaded, size:", pdfBuffer.length, "bytes");
      
      return pdfBuffer;
    }

    if (statusData.status === "error") {
      const errorTask = statusData.tasks.find(t => t.status === "error");
      throw new Error(`CloudConvert job failed: ${errorTask?.name || "unknown error"}`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error("CloudConvert job timed out after 60 seconds");
}

/**
 * Convert DOCX buffer to PDF using Gotenberg (self-hosted)
 * Gotenberg uses LibreOffice for conversion - high quality, free
 */
export async function convertDocxToPdfGotenberg(docxBuffer: Buffer): Promise<Buffer> {
  console.log("[PDF Convert] Using Gotenberg at:", GOTENBERG_URL);

  // Gotenberg expects multipart/form-data with the file
  const formData = new FormData();
  // Convert Buffer to ArrayBuffer for Blob compatibility
  const arrayBuffer = docxBuffer.buffer.slice(
    docxBuffer.byteOffset,
    docxBuffer.byteOffset + docxBuffer.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  formData.append("files", blob, "document.docx");

  const response = await fetch(`${GOTENBERG_URL}/forms/libreoffice/convert`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[PDF Convert] Gotenberg error:", error);
    throw new Error(`Gotenberg conversion failed: ${response.status} - ${error}`);
  }

  const pdfBuffer = Buffer.from(await response.arrayBuffer());
  console.log("[PDF Convert] Gotenberg PDF generated, size:", pdfBuffer.length, "bytes");

  return pdfBuffer;
}

/**
 * Alternative: ConvertAPI (simpler, pay-per-use)
 * Set CONVERTAPI_SECRET environment variable
 */
export async function convertDocxToPdfConvertApi(docxBuffer: Buffer): Promise<Buffer> {
  const secret = process.env.CONVERTAPI_SECRET;
  if (!secret) {
    throw new Error("CONVERTAPI_SECRET not configured");
  }

  console.log("[PDF Convert] Using ConvertAPI...");

  const response = await fetch(`https://v2.convertapi.com/convert/docx/to/pdf?Secret=${secret}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Parameters: [
        {
          Name: "File",
          FileValue: {
            Name: "document.docx",
            Data: docxBuffer.toString("base64"),
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[PDF Convert] ConvertAPI error:", error);
    throw new Error(`ConvertAPI failed: ${response.status}`);
  }

  const result = await response.json();
  const pdfBase64 = result.Files?.[0]?.FileData;

  if (!pdfBase64) {
    throw new Error("No PDF data in ConvertAPI response");
  }

  return Buffer.from(pdfBase64, "base64");
}

/**
 * Main conversion function - tries available providers
 * Priority: Gotenberg (free, self-hosted) > ConvertAPI > CloudConvert
 */
export async function convertToPdf(docxBuffer: Buffer): Promise<Buffer> {
  // Try Gotenberg first (self-hosted, free, unlimited)
  if (GOTENBERG_URL) {
    return convertDocxToPdfGotenberg(docxBuffer);
  }

  // Try ConvertAPI as fallback
  if (process.env.CONVERTAPI_SECRET) {
    return convertDocxToPdfConvertApi(docxBuffer);
  }

  // Try CloudConvert as last resort
  if (CLOUDCONVERT_API_KEY) {
    return convertDocxToPdf(docxBuffer);
  }

  throw new Error(
    "No PDF conversion service configured. Please set GOTENBERG_URL, CONVERTAPI_SECRET, or CLOUDCONVERT_API_KEY."
  );
}
