import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ensureValidToken, type EmailAccount } from "@/lib/email/graph-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
}

// GET /api/email/attachments/list?messageId=xxx
// List all attachments for a message
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");

    if (!messageId) {
      return respondError("messageId is required", 400);
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

    // Fetch attachments from Graph API
    const url = `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Attachments List] Graph API error:", response.status, errorText);
      return respondError("Failed to fetch attachments", response.status);
    }

    const data = await response.json();
    
    // Filter out inline attachments (images embedded in the email body)
    const attachments: Attachment[] = (data.value || [])
      .filter((a: { isInline?: boolean }) => !a.isInline)
      .map((a: { id: string; name: string; contentType: string; size: number; isInline?: boolean }) => ({
        id: a.id,
        name: a.name,
        contentType: a.contentType,
        size: a.size,
        isInline: a.isInline || false,
      }));

    return respondSuccess({
      messageId,
      attachments,
    });
  } catch (err) {
    console.error("[Attachments List] Error:", err);
    return respondError("Failed to fetch attachments", 500);
  }
}
