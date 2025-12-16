import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const factorId = searchParams.get("factorId");

    if (!factorId) {
      return NextResponse.json(
        { error: "factorId is required" },
        { status: 400 }
      );
    }

    // Unenroll the factor
    const { error } = await supabase.auth.mfa.unenroll({ factorId });

    if (error) {
      console.error("[MFA Unenroll] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[MFA Unenroll] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to disable MFA" },
      { status: 500 }
    );
  }
}

