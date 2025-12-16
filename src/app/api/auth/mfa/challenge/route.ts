import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated (they should have just logged in with password)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { factorId } = body;

    if (!factorId) {
      return NextResponse.json(
        { error: "factorId is required" },
        { status: 400 }
      );
    }

    // Create MFA challenge
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });

    if (error) {
      console.error("[MFA Challenge] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[MFA Challenge] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to create MFA challenge" },
      { status: 500 }
    );
  }
}

