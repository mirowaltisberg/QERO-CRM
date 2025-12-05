"use client";

import { usePathname } from "next/navigation";
import { NotificationProvider } from "@/lib/notifications/NotificationContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { FollowUpChecker } from "@/lib/notifications/FollowUpChecker";
import { EmailChecker } from "@/lib/notifications/EmailChecker";
import { ChatNotificationListener } from "@/lib/notifications/ChatNotificationListener";
import { BrowserNotificationPrompt } from "@/lib/notifications/BrowserNotifications";

interface ProvidersProps {
  children: React.ReactNode;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/register", "/auth/callback", "/auth/confirm"];

export function Providers({ children }: ProvidersProps) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));

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
        </>
      )}
    </NotificationProvider>
  );
}
