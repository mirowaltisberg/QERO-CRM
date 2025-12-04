"use client";

import { NotificationProvider } from "@/lib/notifications/NotificationContext";
import { ToastContainer } from "@/components/ui/ToastContainer";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <NotificationProvider>
      {children}
      <ToastContainer />
    </NotificationProvider>
  );
}
