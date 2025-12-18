/**
 * WhatsApp Follow-ups Cron Job
 * Processes due follow-ups and sends WhatsApp reminders
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/whatsapp-followups",
 *     "schedule": "0 * * * *"  // Every hour
 *   }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { processDueFollowUps } from "@/lib/whatsapp/automation-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 second timeout for cron

/**
 * GET /api/cron/whatsapp-followups
 * Called by Vercel Cron
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (recommended for production)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueFollowUps();

    console.log(
      `[Cron] WhatsApp follow-ups processed: ${result.processed} total, ${result.sent} sent, ${result.failed} failed`
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[Cron] WhatsApp follow-ups error:", error);
    return NextResponse.json(
      { error: "Failed to process follow-ups" },
      { status: 500 }
    );
  }
}



