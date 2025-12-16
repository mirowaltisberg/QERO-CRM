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

    const body = await request.json();
    const { factorId, code } = body;

    if (!factorId || !code) {
      return NextResponse.json(
        { error: "factorId and code are required" },
        { status: 400 }
      );
    }

    // For enrollment verification, we need to create a challenge first, then verify
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError) {
      console.error("[MFA Verify] Challenge creation error:", challengeError);
      return NextResponse.json({ error: challengeError.message }, { status: 400 });
    }

    // Verify with the challenge ID
    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    if (error) {
      console.error("[MFA Verify] Enrollment verification error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log("[MFA Verify] Enrollment successful:", data);
    return NextResponse.json({ data, success: true });
  } catch (err) {
    console.error("[MFA Verify] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to verify MFA code" },
      { status: 500 }
    );
  }
}

