"use client";

import { memo, useState, useEffect } from "react";
import type { Notification, NotificationType } from "@/lib/notifications/NotificationContext";

const TypeIcon = ({ type }: { type: NotificationType }) => {
  switch (type) {
    case "chat":
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
          <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
      );
    case "followup":
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    case "email":
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      );
    case "vacancy":
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
          <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      );
  }
};

const getAccentColor = (type: NotificationType) => {
  switch (type) {
    case "chat": return "border-l-blue-500";
    case "followup": return "border-l-amber-500";
    case "email": return "border-l-emerald-500";
    case "vacancy": return "border-l-purple-500";
  }
};

interface ToastProps {
  notification: Notification;
  onDismiss: () => void;
}

export const Toast = memo(function Toast({ notification, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    const enterTimeout = setTimeout(() => setIsEntering(false), 50);
    return () => clearTimeout(enterTimeout);
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const handleClick = () => {
    if (notification.onClick) {
      notification.onClick();
      handleDismiss();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div
      className={`
        w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg
        border-l-4 ${getAccentColor(notification.type)}
        transition-all duration-200 ease-out
        ${isEntering ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"}
        ${isExiting ? "translate-x-full opacity-0" : ""}
        ${notification.onClick ? "cursor-pointer hover:bg-gray-50" : ""}
      `}
      onClick={notification.onClick ? handleClick : undefined}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {notification.avatar ? (
            <img src={notification.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <TypeIcon type={notification.type} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-gray-900">{notification.title}</p>
              <span className="flex-shrink-0 text-xs text-gray-400">{formatTime(notification.timestamp)}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{notification.message}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
            className="flex-shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="h-1 w-full bg-gray-100">
        <div
          className={`h-full transition-all duration-[5000ms] ease-linear ${
            notification.type === "chat" ? "bg-blue-500" :
            notification.type === "followup" ? "bg-amber-500" : 
            notification.type === "vacancy" ? "bg-purple-500" : "bg-emerald-500"
          }`}
          style={{ width: isEntering ? "100%" : "0%" }}
        />
      </div>
    </div>
  );
});
