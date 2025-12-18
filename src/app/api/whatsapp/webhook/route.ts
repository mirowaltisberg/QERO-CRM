/**
 * WhatsApp Cloud API Webhook Handler
 * 
 * GET: Webhook verification (Meta challenge)
 * POST: Incoming messages and status updates
 */

import { NextRequest, NextResponse } from "next/server";
import { processWebhookPayload, verifyWebhookSignature } from "@/lib/whatsapp/webhook-service";
import type { WebhookPayload } from "@/lib/whatsapp/webhook-types";

/**
 * Webhook Verification (GET)
 * Meta sends this to verify the webhook URL
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Get verify token from env
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("[WhatsApp Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Check if this is a valid verification request
  if (mode === "subscribe" && token === verifyToken) {
    console.log("[WhatsApp Webhook] Verification successful");
    // Return the challenge as plain text (required by Meta)
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.error("[WhatsApp Webhook] Verification failed - invalid token");
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * Incoming Events (POST)
 * Messages, status updates, etc.
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    
    // Optional: Verify webhook signature
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const signature = request.headers.get("x-hub-signature-256");
    
    if (appSecret && signature) {
      const isValid = verifyWebhookSignature(rawBody, signature, appSecret);
      if (!isValid) {
        console.error("[WhatsApp Webhook] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Parse payload
    const payload: WebhookPayload = JSON.parse(rawBody);

    // Validate it's from WhatsApp
    if (payload.object !== "whatsapp_business_account") {
      console.error("[WhatsApp Webhook] Invalid payload object:", payload.object);
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Process asynchronously - return 200 immediately to acknowledge receipt
    // This is important because Meta expects a quick response
    processWebhookPayload(payload).catch((error) => {
      console.error("[WhatsApp Webhook] Processing error:", error);
    });

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ status: "received" }, { status: 200 });
  } catch (error) {
    console.error("[WhatsApp Webhook] Error:", error);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}



