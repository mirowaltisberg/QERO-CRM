import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Microsoft OAuth endpoints
const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

// Required scopes for Outlook access
const SCOPES = [
  "openid",
  "profile", 
  "email",
  "offline_access",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
].join(" ");

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${request.nextUrl.origin}/api/email/auth/callback`;

  if (!clientId) {
    console.error("Missing MICROSOFT_CLIENT_ID environment variable");
    return NextResponse.redirect(new URL("/settings?error=config", request.url));
  }

  // Generate state parameter for CSRF protection (includes user ID)
  const state = Buffer.from(JSON.stringify({
    userId: user.id,
    timestamp: Date.now(),
  })).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_mode: "query",
    state,
    // Don't force consent - admin already granted it
  });

  return NextResponse.redirect(`${MICROSOFT_AUTH_URL}?${params.toString()}`);
}

