import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Start MFA enrollment
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Google Authenticator",
    });

    if (error) {
      console.error("[MFA Enroll] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Transform the response to match the expected format
    // Supabase returns: { id, type, totp: { qr_code, secret, uri } }
    const transformedData = {
      id: data.id,
      qr_code: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    };

    return NextResponse.json({ data: transformedData });
  } catch (err) {
    console.error("[MFA Enroll] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to start MFA enrollment" },
      { status: 500 }
    );
  }
}

