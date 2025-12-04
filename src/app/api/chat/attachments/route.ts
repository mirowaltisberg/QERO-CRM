import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    // Auth check with regular client
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) return respondError("No file provided", 400);
    if (file.size > MAX_FILE_SIZE) return respondError("File too large (max 10MB)", 400);

    // Use admin client for storage operations
    const adminSupabase = createAdminClient();

    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const path = `${user.id}/${timestamp}-${sanitizedName}`;

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data, error } = await adminSupabase.storage
      .from("chat-attachments")
      .upload(path, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Storage upload error:", error);
      return respondError(`Upload failed: ${error.message}`, 500);
    }

    const { data: urlData } = adminSupabase.storage
      .from("chat-attachments")
      .getPublicUrl(path);

    return respondSuccess({
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_type: file.type,
      file_size: file.size,
      path: data.path,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return respondError("Failed to upload file", 500);
  }
}
