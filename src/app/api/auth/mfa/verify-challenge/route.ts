import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
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
    const { factorId, challengeId, code } = body;

    if (!factorId || !challengeId || !code) {
      return NextResponse.json(
        { error: "factorId, challengeId, and code are required" },
        { status: 400 }
      );
    }

    // Verify the challenge code
    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });

    if (error) {
      console.error("[MFA Verify Challenge] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // MFA verified successfully - clear the pending cookie
    const cookieStore = await cookies();
    cookieStore.set("qero_mfa_pending", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0, // Expire immediately
      path: "/",
    });

    return NextResponse.json({ data, success: true });
  } catch (err) {
    console.error("[MFA Verify Challenge] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to verify MFA challenge" },
      { status: 500 }
    );
  }
}

