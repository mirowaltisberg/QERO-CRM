import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_USER_URL = "https://graph.microsoft.com/v1.0/me";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GraphUserResponse {
  mail?: string;
  userPrincipalName: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?error=missing_params", request.url));
  }

  // Verify state and extract user ID
  let userId: string;
  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = stateData.userId;
    
    // Check state is not too old (5 minutes)
    if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
      return NextResponse.redirect(new URL("/settings?error=expired_state", request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/settings?error=invalid_state", request.url));
  }

  // Verify user is still logged in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${request.nextUrl.origin}/api/email/auth/callback`;

  if (!clientId || !clientSecret) {
    console.error("Missing Microsoft OAuth credentials");
    return NextResponse.redirect(new URL("/settings?error=config", request.url));
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", tokenResponse.status, errorText);
      // Include more details in the error for debugging
      const errorParam = encodeURIComponent(`token_exchange_${tokenResponse.status}`);
      return NextResponse.redirect(new URL(`/settings?error=${errorParam}`, request.url));
    }

    const tokens: TokenResponse = await tokenResponse.json();

    // Get user's email address from Graph API
    const userResponse = await fetch(GRAPH_USER_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userResponse.ok) {
      console.error("Failed to fetch user info from Graph API");
      return NextResponse.redirect(new URL("/settings?error=user_info", request.url));
    }

    const graphUser: GraphUserResponse = await userResponse.json();
    const mailbox = graphUser.mail || graphUser.userPrincipalName;

    // Store tokens in database (using admin client to bypass RLS for upsert)
    const adminSupabase = createAdminClient();
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: dbError } = await adminSupabase
      .from("email_accounts")
      .upsert(
        {
          user_id: userId,
          provider: "outlook",
          mailbox,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      );

    if (dbError) {
      console.error("Failed to save email account:", dbError);
      return NextResponse.redirect(new URL("/settings?error=db_error", request.url));
    }

    return NextResponse.redirect(new URL("/settings?email_connected=true", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    const errorMsg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(new URL(`/settings?error=callback_${encodeURIComponent(errorMsg)}`, request.url));
  }
}

