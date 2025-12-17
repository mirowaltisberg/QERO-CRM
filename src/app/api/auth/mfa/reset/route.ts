import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * DELETE /api/auth/mfa/reset
 * 
 * Removes ALL MFA factors for the current user, including:
 * - Verified factors (active 2FA)
 * - Unverified factors (failed enrollment attempts)
 * 
 * Use this to clean up failed 2FA setup attempts.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // List all factors (both verified and unverified)
    const { data: factorsData, error: listError } = await supabase.auth.mfa.listFactors();

    if (listError) {
      console.error("[MFA Reset] Error listing factors:", listError);
      return NextResponse.json({ error: listError.message }, { status: 400 });
    }

    // Get all TOTP factors (both verified and unverified)
    const allFactors = factorsData?.all || [];
    const totpFactors = allFactors.filter((f) => f.factor_type === "totp");

    console.log("[MFA Reset] Found factors:", totpFactors.map(f => ({
      id: f.id,
      status: f.status,
      friendly_name: f.friendly_name
    })));

    if (totpFactors.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No MFA factors found",
        removed: 0
      });
    }

    // Remove all TOTP factors
    const results = [];
    for (const factor of totpFactors) {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ 
        factorId: factor.id 
      });
      
      if (unenrollError) {
        console.error(`[MFA Reset] Failed to remove factor ${factor.id}:`, unenrollError);
        results.push({ id: factor.id, success: false, error: unenrollError.message });
      } else {
        console.log(`[MFA Reset] Removed factor ${factor.id}`);
        results.push({ id: factor.id, success: true });
      }
    }

    const removed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({ 
      success: failed === 0,
      message: `Removed ${removed} factor(s)${failed > 0 ? `, ${failed} failed` : ""}`,
      removed,
      failed,
      results
    });
  } catch (err) {
    console.error("[MFA Reset] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to reset MFA" },
      { status: 500 }
    );
  }
}
