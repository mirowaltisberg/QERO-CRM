"use client";

import { useEffect, useState, useCallback } from "react";

interface PushNotificationManagerProps {
  onStatusChange?: (status: "granted" | "denied" | "default" | "unsupported") => void;
}

export function PushNotificationManager({ onStatusChange }: PushNotificationManagerProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Check if push notifications are supported
  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setIsSupported(supported);

    if (supported) {
      registerServiceWorker();
    } else {
      onStatusChange?.("unsupported");
    }
  }, [onStatusChange]);

  // Register service worker
  const registerServiceWorker = async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("[Push] Service worker registered:", reg);
      setRegistration(reg);

      // Check existing subscription
      const subscription = await reg.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
      
      if (subscription) {
        onStatusChange?.("granted");
      } else {
        onStatusChange?.(Notification.permission as "granted" | "denied" | "default");
      }
    } catch (error) {
      console.error("[Push] Service worker registration failed:", error);
    }
  };

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!registration) {
      console.error("[Push] No service worker registration");
      return false;
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      onStatusChange?.(permission as "granted" | "denied" | "default");
      
      if (permission !== "granted") {
        console.log("[Push] Notification permission denied");
        return false;
      }

      // Get VAPID public key
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error("[Push] VAPID public key not found");
        return false;
      }

      // Convert VAPID key to Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      console.log("[Push] Push subscription:", subscription);

      // Send subscription to server
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!response.ok) {
        throw new Error("Failed to save subscription");
      }

      setIsSubscribed(true);
      console.log("[Push] Successfully subscribed to push notifications");
      return true;
    } catch (error) {
      console.error("[Push] Subscription failed:", error);
      return false;
    }
  }, [registration, onStatusChange]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!registration) return false;

    try {
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return true;

      // Unsubscribe from push
      await subscription.unsubscribe();

      // Remove from server
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      setIsSubscribed(false);
      console.log("[Push] Successfully unsubscribed from push notifications");
      return true;
    } catch (error) {
      console.error("[Push] Unsubscribe failed:", error);
      return false;
    }
  }, [registration]);

  // Auto-subscribe if permission already granted
  useEffect(() => {
    if (registration && Notification.permission === "granted" && !isSubscribed) {
      subscribe();
    }
  }, [registration, isSubscribed, subscribe]);

  return { isSupported, isSubscribed, subscribe, unsubscribe };
}

// Hook version for easier use
export function usePushNotifications() {
  const [status, setStatus] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const manager = PushNotificationManager({ onStatusChange: setStatus });
  
  return {
    ...manager,
    status,
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

