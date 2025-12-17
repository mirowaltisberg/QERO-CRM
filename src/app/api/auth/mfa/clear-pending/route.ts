import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const cookieStore = await cookies();
    
    // Clear the MFA pending cookie
    cookieStore.set("qero_mfa_pending", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0, // Expire immediately
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[MFA Clear Pending] Error:", err);
    return NextResponse.json(
      { error: "Failed to clear MFA pending state" },
      { status: 500 }
    );
  }
}
