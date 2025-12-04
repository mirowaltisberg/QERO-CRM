"use client";

import { useEffect, useState } from "react";

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

// Component to request permission on first load
export function BrowserNotificationPrompt() {
  const { permission, requestPermission } = useBrowserNotifications();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Check if user has already dismissed the prompt
    const wasDismissed = localStorage.getItem("notification_prompt_dismissed");
    if (wasDismissed !== "true" && permission === "default") {
      setDismissed(false);
    }
  }, [permission]);

  if (dismissed || permission !== "default") return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("notification_prompt_dismissed", "true");
  };

  const handleAllow = async () => {
    await requestPermission();
    setDismissed(true);
    localStorage.setItem("notification_prompt_dismissed", "true");
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
      <p className="text-sm font-medium text-gray-900">Benachrichtigungen aktivieren?</p>
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
