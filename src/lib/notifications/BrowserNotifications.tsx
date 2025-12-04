"use client";

import { useEffect, useState, useCallback } from "react";

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

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      // Some browsers don't support requestPermission as a promise
      Notification.requestPermission((result) => {
        setPermission(result);
      });
    }
  };

  const showNotification = (title: string, body: string, onClick?: () => void) => {
    // Only show if permission granted and tab is not focused
    if (permission !== "granted") return;
    if (document.hasFocus()) return;

    const notification = new Notification(title, {
      body,
      icon: "/qero-logo-email.png",
      tag: `qero-${Date.now()}`, // Prevent duplicate notifications
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  };

  return { permission, requestPermission, showNotification };
}

// Component to request permission and set up push
export function BrowserNotificationPrompt() {
  const { permission, requestPermission } = useBrowserNotifications();
  const [dismissed, setDismissed] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  // Detect iOS and standalone mode
  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                      (navigator as unknown as { standalone?: boolean }).standalone === true;
    
    setIsIOS(iOS);
    setIsStandalone(standalone);
    
    console.log("[Push] Platform detection - iOS:", iOS, "Standalone:", standalone);
    
    // Check if user has already dismissed the prompt
    const wasDismissed = localStorage.getItem("notification_prompt_dismissed");
    if (wasDismissed !== "true" && permission === "default") {
      setDismissed(false);
    }
    
    // Check existing push subscription
    checkPushSubscription();
  }, [permission]);

  const checkPushSubscription = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.log("[Push] Push notifications not supported");
      return;
    }
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushSubscribed(!!subscription);
      console.log("[Push] Existing subscription:", !!subscription);
    } catch (err) {
      console.error("[Push] Error checking subscription:", err);
    }
  };

  const subscribeToPush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.log("[Push] Push not supported");
      return false;
    }

    try {
      // Register service worker first
      const registration = await navigator.serviceWorker.register("/sw.js");
      console.log("[Push] Service worker registered");
      
      // Wait for it to be ready
      await navigator.serviceWorker.ready;
      console.log("[Push] Service worker ready");

      // Get VAPID public key
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error("[Push] VAPID public key not found");
        return false;
      }

      // Convert VAPID key
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      console.log("[Push] Subscription created:", subscription.endpoint);

      // Send subscription to server
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!response.ok) {
        throw new Error("Failed to save subscription");
      }

      setPushSubscribed(true);
      console.log("[Push] Successfully subscribed to push notifications");
      return true;
    } catch (error) {
      console.error("[Push] Subscription failed:", error);
      return false;
    }
  }, []);

  // Auto-subscribe when permission is granted
  useEffect(() => {
    if (permission === "granted" && !pushSubscribed) {
      subscribeToPush();
    }
  }, [permission, pushSubscribed, subscribeToPush]);

  if (dismissed || (permission === "granted" && pushSubscribed)) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("notification_prompt_dismissed", "true");
  };

  const handleAllow = async () => {
    await requestPermission();
    await subscribeToPush();
    setDismissed(true);
    localStorage.setItem("notification_prompt_dismissed", "true");
  };

  // iOS not in standalone mode - show add to home screen instructions
  if (isIOS && !isStandalone) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
        <p className="text-sm font-medium text-gray-900">📱 App installieren</p>
        <p className="mt-1 text-xs text-gray-500">
          Für Push-Benachrichtigungen auf iPhone: Tippe auf{" "}
          <span className="inline-flex items-center">
            <svg className="h-4 w-4 mx-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2 2h-1v8h-2V4H10l2-2zm0 20l-2-2h1v-8h2v8h1l-2 2z"/>
              <path d="M4 12h8v2H4z M12 12h8v2h-8z"/>
            </svg>
          </span>{" "}
          und dann &quot;Zum Home-Bildschirm&quot;.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleDismiss}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            Verstanden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
      <p className="text-sm font-medium text-gray-900">🔔 Benachrichtigungen aktivieren?</p>
      <p className="mt-1 text-xs text-gray-500">
        Erhalte Benachrichtigungen für neue Nachrichten und Follow-ups auch wenn der Tab nicht aktiv ist.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleAllow}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
        >
          Aktivieren
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Später
        </button>
      </div>
    </div>
  );
}

