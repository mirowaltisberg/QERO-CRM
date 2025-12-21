"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { NotificationProvider } from "@/lib/notifications/NotificationContext";
import { TmaCacheProvider } from "@/lib/cache/TmaCacheContext";
import { PresenceProvider } from "@/lib/hooks/PresenceContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { FollowUpChecker } from "@/lib/notifications/FollowUpChecker";
import { EmailChecker } from "@/lib/notifications/EmailChecker";
import { ChatNotificationListener } from "@/lib/notifications/ChatNotificationListener";
import { BrowserNotificationPrompt } from "@/lib/notifications/BrowserNotifications";
import { CommandPalette } from "@/components/ui/CommandPalette";

interface ProvidersProps {
  children: React.ReactNode;
  user?: {
    id?: string;
  } | null;
  profile?: {
    id?: string;
    full_name?: string;
    avatar_url?: string | null;
    team_id?: string | null;
  } | null;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/register", "/auth/callback", "/auth/confirm"];

export function Providers({ children, user, profile }: ProvidersProps) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Memoize presence user to avoid unnecessary re-renders
  const presenceUser = useMemo(() => {
    if (!user?.id || !profile?.full_name) return null;
    return {
      id: user.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url || null,
    };
  }, [user?.id, profile?.full_name, profile?.avatar_url]);

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

  // Wrap content in TmaCacheProvider and PresenceProvider only for authenticated routes
  const content = isPublicRoute ? (
    children
  ) : (
    <PresenceProvider teamId={profile?.team_id || null} currentUser={presenceUser}>
      <TmaCacheProvider>{children}</TmaCacheProvider>
    </PresenceProvider>
  );

  return (
    <NotificationProvider>
      {content}
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
