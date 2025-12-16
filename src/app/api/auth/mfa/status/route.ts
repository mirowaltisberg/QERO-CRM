import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // List all enrolled factors
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      console.error("[MFA Status] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Check if user has TOTP factor enrolled
    const totpFactor = data?.totp?.find((factor) => factor.status === "verified");
    const isEnabled = !!totpFactor;

    return NextResponse.json({
      data: {
        enabled: isEnabled,
        factor: totpFactor || null,
        allFactors: data,
      },
    });
  } catch (err) {
    console.error("[MFA Status] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to get MFA status" },
      { status: 500 }
    );
  }
}

