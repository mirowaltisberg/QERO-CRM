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

    // For enrollment verification, verify directly without a challenge
    // (challenges are only for login flow, not enrollment)
    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
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

