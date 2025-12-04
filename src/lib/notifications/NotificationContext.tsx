"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";

export type NotificationType = "chat" | "followup" | "email";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  avatar?: string;
  onClick?: () => void;
  data?: Record<string, unknown>;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const counterRef = useRef(0);

  const addNotification = useCallback((notification: Omit<Notification, "id" | "timestamp">) => {
    const id = `notif-${Date.now()}-${counterRef.current++}`;
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: new Date(),
    };

    setNotifications((prev) => {
      const updated = [newNotification, ...prev].slice(0, 5);
      return updated;
    });

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);

    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}
