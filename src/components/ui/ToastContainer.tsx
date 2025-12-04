"use client";

import { memo } from "react";
import { useNotifications } from "@/lib/notifications/NotificationContext";
import { Toast } from "./Toast";

export const ToastContainer = memo(function ToastContainer() {
  const { notifications, removeNotification } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[9999] flex flex-col gap-3">
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onDismiss={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
});
