"use client";

import { NotificationProvider } from "@/lib/notifications/NotificationContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { FollowUpChecker } from "@/lib/notifications/FollowUpChecker";
import { EmailChecker } from "@/lib/notifications/EmailChecker";
import { BrowserNotificationPrompt } from "@/lib/notifications/BrowserNotifications";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <NotificationProvider>
      {children}
      <ToastContainer />
      <FollowUpChecker />
      <EmailChecker />
      <BrowserNotificationPrompt />
    </NotificationProvider>
  );
}
