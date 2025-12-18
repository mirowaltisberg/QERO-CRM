"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";

interface SidebarProps {
  user?: {
    email?: string;
    user_metadata?: {
      full_name?: string;
    };
  } | null;
  profile?: {
    full_name?: string;
    avatar_url?: string | null;
  } | null;
}

const navigationKeys = [
  { key: "calling", href: "/calling", icon: PhoneIcon, shortcut: "G then C" },
  { key: "companies", href: "/contacts", icon: UsersIcon, shortcut: "G then T" },
  { key: "tma", href: "/tma", icon: UsersIcon, shortcut: "G then M" },
  { key: "vakanzen", href: "/vakanzen", icon: BriefcaseIcon, shortcut: "G then V" },
  { key: "email", href: "/email", icon: EmailIcon, shortcut: "G then E" },
  { key: "chat", href: "/chat", icon: ChatIcon, shortcut: "G then H" },
  { key: "dashboard", href: "/dashboard", icon: ChartIcon, shortcut: "G then D" },
];

export function Sidebar({ user, profile }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  // Start with false (server default), then read from localStorage after mount
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Poll chat unread count every 30 seconds (simple and safe)
  useEffect(() => {
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
  }, []);

  // Read localStorage only after hydration to avoid mismatch
  useEffect(() => {
    setMounted(true);
    const stored = window.localStorage.getItem("qero-sidebar-collapsed");
    if (stored === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const newValue = !prev;
      window.localStorage.setItem("qero-sidebar-collapsed", String(newValue));
      return newValue;
    });
  };

  const displayName = profile?.full_name || user?.user_metadata?.full_name || "User";
  const avatarUrl = profile?.avatar_url;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Use expanded state during SSR and initial render to avoid hydration mismatch
  const isCollapsed = mounted ? collapsed : false;

  // Hide sidebar completely on mobile when on chat page
  if (isMobile && mounted && pathname === "/chat") {
    return null;
  }

  return (
    <aside
      className={cn(
        "h-full border-r border-border bg-gray-50 flex flex-col transition-[width] duration-200 ease-out",
        isCollapsed ? "w-16" : "w-56",
        // Hide on mobile for chat page via CSS (before JS hydration)
        pathname === "/chat" && "hidden md:flex"
      )}
    >
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          "flex items-center border-b border-border",
          isCollapsed ? "h-auto flex-col gap-1 py-3" : "h-16 justify-between px-3"
        )}
      >
        {isCollapsed ? (
          <Link href="/calling" className="flex items-center justify-center">
            <Image src="/qero-logo.svg" alt="QERO" width={28} height={28} priority className="h-7 w-7" />
          </Link>
        ) : (
          <Link href="/calling" className="flex items-center">
            <Image src="/qero-logo.svg" alt="QERO" width={100} height={32} priority className="h-8 w-auto" />
          </Link>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronIcon collapsed={isCollapsed} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2">
        <ul className="space-y-0.5">
          {navigationKeys.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/" && pathname?.startsWith(item.href));
            const name = t(item.key);
            
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  prefetch={true}
                  className={cn(
                    "group flex items-center rounded-md text-sm transition-colors duration-100 relative",
                    isCollapsed ? "justify-center p-2" : "gap-2.5 px-3 py-2",
                    isActive
                      ? "bg-white text-gray-900 shadow-sm border border-border"
                      : "text-gray-600 hover:bg-white hover:text-gray-900"
                  )}
                  title={isCollapsed ? `${name} (${item.shortcut})` : undefined}
                >
                  <div className="relative">
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.key === "chat" && chatUnreadCount > 0 && isCollapsed && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </span>
                    )}
                  </div>
                  {!isCollapsed && <span className="flex-1 whitespace-nowrap">{name}</span>}
                  {item.key === "chat" && chatUnreadCount > 0 && !isCollapsed && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium text-white">
                      {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                    </span>
                  )}
                  {!isCollapsed && !isActive && item.key !== "chat" && (
                    <span className="text-xs text-gray-400 hidden group-hover:block">
                      {item.shortcut}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      {user && (
        <div className="border-t border-border p-2">
          <Link
            href="/settings"
            prefetch={true}
            className={cn(
              "flex items-center rounded-md text-sm transition-colors duration-100",
              isCollapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
              pathname === "/settings"
                ? "bg-white text-gray-900 shadow-sm border border-border"
                : "text-gray-600 hover:bg-white hover:text-gray-900"
            )}
            title={isCollapsed ? displayName : undefined}
          >
            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  width={32}
                  height={32}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-500">
                  {initials}
                </div>
              )}
            </div>
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-gray-900">{displayName}</p>
                  <p className="truncate text-xs text-gray-500">{user.email}</p>
                </div>
                <SettingsIcon className="h-4 w-4 text-gray-400" />
              </>
            )}
          </Link>
        </div>
      )}

      {/* Keyboard hints + version */}
      <div className="p-4 border-t border-border">
        {!isCollapsed ? (
          <div className="text-xs text-gray-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>{tCommon("commandPalette")}</span>
              <kbd className="kbd">Q</kbd>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-gray-300">v1.54.0</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-xs text-gray-400">
            <kbd className="kbd">Q</kbd>
            <span className="text-[10px] text-gray-300">v1.54.0</span>
          </div>
        )}
      </div>
    </aside>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4 transition-transform duration-200", collapsed ? "rotate-180" : "rotate-0")}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 19l-7-7 7-7" />
    </svg>
  );
}

// Minimal SVG Icons
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
      />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
      />
    </svg>
  );
}

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 14.15v4.073c0 1.078-.875 1.953-1.953 1.953H5.703c-1.078 0-1.953-.875-1.953-1.953V14.15M12 9.75v6M15 12.75H9M8.25 3.75h7.5a2.25 2.25 0 012.25 2.25v9.75H6V6a2.25 2.25 0 012.25-2.25z"
      />
    </svg>
  );
}
