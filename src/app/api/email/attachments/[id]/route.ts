import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/email/attachments/[id]?messageId=xxx - Fetch and stream attachment
// Also supports ?cid=xxx&messageId=xxx for inline attachments by content ID
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get("cid");
    const messageId = searchParams.get("messageId");
    const attachmentId = (await context.params).id;

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

    // If we have a content ID, we need to find the attachment by cid
    let graphAttachmentId = attachmentId;
    let graphMessageId = messageId;

    if (contentId && messageId) {
      // Fetch attachments for this message and find by contentId
      const attachmentsUrl = `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments`;
      const attachmentsRes = await fetch(attachmentsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!attachmentsRes.ok) {
        return respondError("Failed to fetch attachments", 500);
      }

      const attachmentsData = await attachmentsRes.json();
      const attachment = attachmentsData.value?.find(
        (a: { contentId?: string }) => a.contentId === contentId || a.contentId === `<${contentId}>`
      );

      if (!attachment) {
        return respondError("Attachment not found", 404);
      }

      graphAttachmentId = attachment.id;
      graphMessageId = messageId;
    }

    if (!graphMessageId) {
      return respondError("Message ID required", 400);
    }

    // Fetch the attachment content from Graph API
    const url = `${GRAPH_BASE_URL}/me/messages/${graphMessageId}/attachments/${graphAttachmentId}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Attachment] Graph API error:", response.status, errorText);
      return respondError("Failed to fetch attachment", response.status);
    }

    const data = await response.json();

    // Graph returns base64-encoded content for file attachments
    if (!data.contentBytes) {
      return respondError("Attachment has no content", 404);
    }

    // Decode base64 content
    const buffer = Buffer.from(data.contentBytes, "base64");

    // Return the attachment with proper headers
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": data.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${data.name || "attachment"}"`,
        "Cache-Control": "private, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (err) {
    console.error("[Attachment] Error:", err);
    return respondError("Failed to fetch attachment", 500);
  }
}

