import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// GET /api/email/attachments/inline?cid=xxx&messageId=xxx
// Fetch inline attachment by content ID
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get("cid");
    const messageId = searchParams.get("messageId");

    if (!contentId || !messageId) {
      return respondError("cid and messageId are required", 400);
    }

    const adminSupabase = createAdminClient();

    // Get user's email account
    const { data: account } = await adminSupabase
      .from("email_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .single();

    if (!account) {
      return respondError("No email account connected", 404);
    }

    const emailAccount = account as EmailAccount;

    // Get access token
    let accessToken: string;
    try {
      accessToken = await ensureValidToken(emailAccount);
    } catch {
      return respondError("Failed to authenticate with Microsoft", 401);
    }

    // Fetch all attachments for this message
    const attachmentsUrl = `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments`;
    const attachmentsRes = await fetch(attachmentsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!attachmentsRes.ok) {
      const errorText = await attachmentsRes.text();
      console.error("[Inline Attachment] Failed to fetch attachments:", attachmentsRes.status, errorText);
      return respondError("Failed to fetch attachments", 500);
    }

    const attachmentsData = await attachmentsRes.json();
    
    // Find attachment by contentId (Graph may include angle brackets)
    const attachment = attachmentsData.value?.find(
      (a: { contentId?: string; isInline?: boolean }) => {
        if (!a.contentId) return false;
        const cleanCid = a.contentId.replace(/^<|>$/g, "");
        return cleanCid === contentId || a.contentId === contentId;
      }
    );

    if (!attachment) {
      console.log("[Inline Attachment] Not found. Available:", 
        attachmentsData.value?.map((a: { contentId?: string; name?: string }) => ({
          contentId: a.contentId,
          name: a.name
        }))
      );
      // Return a transparent 1x1 pixel as fallback
      const transparentGif = Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64"
      );
      return new NextResponse(transparentGif, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    // If attachment has contentBytes inline (small files), use directly
    if (attachment.contentBytes) {
      const buffer = Buffer.from(attachment.contentBytes, "base64");
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": attachment.contentType || "application/octet-stream",
          "Content-Disposition": `inline; filename="${attachment.name || "inline"}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    // Otherwise fetch the full attachment
    const attachmentUrl = `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments/${attachment.id}`;
    const attachmentRes = await fetch(attachmentUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!attachmentRes.ok) {
      return respondError("Failed to fetch attachment content", 500);
    }

    const attachmentData = await attachmentRes.json();
    
    if (!attachmentData.contentBytes) {
      return respondError("Attachment has no content", 404);
    }

    const buffer = Buffer.from(attachmentData.contentBytes, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachmentData.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${attachmentData.name || "inline"}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[Inline Attachment] Error:", err);
    return respondError("Failed to fetch attachment", 500);
  }
}

