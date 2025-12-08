"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NotificationProvider } from "@/lib/notifications/NotificationContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { FollowUpChecker } from "@/lib/notifications/FollowUpChecker";
import { EmailChecker } from "@/lib/notifications/EmailChecker";
import { ChatNotificationListener } from "@/lib/notifications/ChatNotificationListener";
import { BrowserNotificationPrompt } from "@/lib/notifications/BrowserNotifications";
import { CommandPalette } from "@/components/ui/CommandPalette";

interface ProvidersProps {
  children: React.ReactNode;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/register", "/auth/callback", "/auth/confirm"];

export function Providers({ children }: ProvidersProps) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Global keyboard shortcut for command palette (Q key)
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Q key opens command palette (only when not typing)
      if (event.key.toLowerCase() === "q" && !isTyping && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    },
    []
  );

  useEffect(() => {
    // Only add listener on protected routes
    if (isPublicRoute) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, isPublicRoute]);

  return (
    <NotificationProvider>
      {children}
      <ToastContainer />
      {/* Only render auth-dependent components on protected routes */}
      {!isPublicRoute && (
        <>
          <FollowUpChecker />
          <EmailChecker />
          <ChatNotificationListener />
          <BrowserNotificationPrompt />
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
          />
        </>
      )}
    </NotificationProvider>
  );
}
