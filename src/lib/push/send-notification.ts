import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:support@qero.ch",
    vapidPublicKey,
    vapidPrivateKey
  );
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  roomId?: string;
  tag?: string;
}

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send push notification to a specific user
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("VAPID keys not configured, skipping push notification");
    return;
  }

  const supabase = createAdminClient();

  // Get user's push subscriptions
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching push subscriptions:", error);
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    return; // User has no push subscriptions
  }

  // Send notification to all user's devices
  const results = await Promise.allSettled(
    subscriptions.map((sub: PushSubscription) =>
      sendPush(sub, payload)
    )
  );

  // Clean up expired subscriptions
  const expiredEndpoints: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const error = result.reason;
      if (error?.statusCode === 410 || error?.statusCode === 404) {
        // Subscription expired or not found
        expiredEndpoints.push(subscriptions[index].endpoint);
      }
    }
  });

  // Remove expired subscriptions
  if (expiredEndpoints.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", expiredEndpoints);
  }
}

/**
 * Send push notification to multiple users
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  await Promise.allSettled(
    userIds.map((userId) => sendPushToUser(userId, payload))
  );
}

/**
 * Send a single push notification
 */
async function sendPush(subscription: PushSubscription, payload: PushPayload) {
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  return webpush.sendNotification(
    pushSubscription,
    JSON.stringify(payload),
    {
      TTL: 60 * 60, // 1 hour
      urgency: "high",
    }
  );
}

