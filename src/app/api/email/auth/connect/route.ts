import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Microsoft OAuth endpoints
const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

// Required scopes for Outlook access (email + contacts)
const SCOPES = [
  "openid",
  "profile", 
  "email",
  "offline_access",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Contacts.Read",
].join(" ");

export async function GET(request: NextRequest) {
  // Create Supabase client with request cookies directly (for API routes)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // No-op for read-only auth check
        },
      },
    }
  );
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  console.log("[Email Connect] Auth check:", {
    hasUser: !!user,
    userId: user?.id,
    authError: authError?.message,
    cookies: request.cookies.getAll().map(c => c.name),
  });

  if (!user) {
    console.error("[Email Connect] No user session, redirecting to login");
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

