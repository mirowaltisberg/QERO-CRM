"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { MobileNavBar } from "./MobileNavBar";

interface AppShellProps {
  user: {
    email?: string;
    user_metadata?: {
      full_name?: string;
    };
  } | null;
  profile: {
    full_name?: string;
    avatar_url?: string | null;
  } | null;
  children: React.ReactNode;
}

export function AppShell({ user, profile, children }: AppShellProps) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  // Detect mobile
  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Poll chat unread count
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/chat/rooms");
        if (!res.ok || !isMounted) return;
        const json = await res.json();
        if (json.data && isMounted) {
          const total = json.data.reduce((sum: number, room: { unread_count?: number }) => 
            sum + (room.unread_count || 0), 0);
          setChatUnreadCount(total);
        }
      } catch {
        // Silently ignore errors
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  // No user = no shell (login page)
  if (!user) {
    return <main className="flex-1">{children}</main>;
  }

  // Server-side render: show nothing for navigation (will hydrate)
  if (!mounted) {
    return (
      <div className="flex h-screen">
        <div className="hidden md:flex w-56 border-r border-border bg-gray-50" />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen">
        <main 
          className="flex-1 overflow-hidden"
          style={{ 
            paddingBottom: "calc(49px + env(safe-area-inset-bottom, 0px))" 
          }}
        >
          {children}
        </main>
        <MobileNavBar chatUnreadCount={chatUnreadCount} />
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex h-screen">
      <Sidebar user={user} profile={profile} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
