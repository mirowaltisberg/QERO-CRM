"use client";

import { useState, useCallback, useRef, memo } from "react";
import Image from "next/image";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getWhatsAppLink, formatPhoneForDisplay } from "@/lib/utils/phone";

interface UserCardData {
  profile: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    email: string | null;
    phone: string | null;
    team_id: string | null;
    team: {
      id: string;
      name: string;
      color: string;
    } | null;
  };
  stats: {
    callsToday: number;
    callsThisWeek: number;
    claimedTmaCount: number;
    assignedWhatsappCount: number;
  };
}

interface UserProfileCardPopoverProps {
  userId: string;
  children: React.ReactNode;
  /** Function to check if user is online (from useTeamPresence) */
  isOnline?: (userId: string) => boolean;
}

// Simple cache for user card data to avoid refetching
const userCardCache = new Map<string, { data: UserCardData; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

export const UserProfileCardPopover = memo(function UserProfileCardPopover({
  userId,
  children,
  isOnline,
}: UserProfileCardPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [data, setData] = useState<UserCardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUserCard = useCallback(async () => {
    // Check cache first
    const cached = userCardCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setData(cached.data);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/${userId}/card`);
      if (!res.ok) {
        throw new Error("Failed to fetch user data");
      }
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        userCardCache.set(userId, { data: json.data, timestamp: Date.now() });
      } else {
        throw new Error(json.error || "Unknown error");
      }
    } catch (err) {
      console.error("[UserProfileCard] Fetch error:", err);
      setError("Could not load user data");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const handleMouseEnter = useCallback(() => {
    // Clear any pending leave timeout
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }

    // Don't open if already pinned
    if (pinned) return;

    // Delay opening to avoid accidental hovers
    hoverTimeoutRef.current = setTimeout(() => {
      setOpen(true);
      fetchUserCard();
    }, 200);
  }, [pinned, fetchUserCard]);

  const handleMouseLeave = useCallback(() => {
    // Clear any pending open timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Don't close if pinned
    if (pinned) return;

    // Small delay before closing to allow moving to popover content
    leaveTimeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 150);
  }, [pinned]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!open) {
      setOpen(true);
      setPinned(true);
      fetchUserCard();
    } else {
      // Toggle pin
      setPinned(!pinned);
      if (pinned) {
        // Unpinning - close immediately
        setOpen(false);
      }
    }
  }, [open, pinned, fetchUserCard]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen && !pinned) {
      setOpen(false);
    } else if (!newOpen && pinned) {
      // Allow closing pinned popover by clicking outside
      setOpen(false);
      setPinned(false);
    }
  }, [pinned]);

  const handleContentMouseEnter = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  const handleContentMouseLeave = useCallback(() => {
    if (!pinned) {
      leaveTimeoutRef.current = setTimeout(() => {
        setOpen(false);
      }, 150);
    }
  }, [pinned]);

  const online = isOnline ? isOnline(userId) : false;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          className="cursor-pointer"
          role="button"
          tabIndex={0}
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        onMouseEnter={handleContentMouseEnter}
        onMouseLeave={handleContentMouseLeave}
        sideOffset={8}
      >
        {loading && !data ? (
          <div className="p-4">
            <div className="flex items-center gap-3 animate-pulse">
              <div className="h-12 w-12 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="h-3 w-16 rounded bg-gray-200" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-500">{error}</div>
        ) : data ? (
          <UserCardContent data={data} online={online} pinned={pinned} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
});

// Separate content component for cleaner code
const UserCardContent = memo(function UserCardContent({
  data,
  online,
  pinned,
}: {
  data: UserCardData;
  online: boolean;
  pinned: boolean;
}) {
  const { profile, stats } = data;
  const initials = profile.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";

  const whatsAppLink = getWhatsAppLink(profile.phone);
  const phoneDisplay = formatPhoneForDisplay(profile.phone);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add toast notification here
      console.log(`Copied ${label} to clipboard`);
    });
  };

  return (
    <div className="divide-y divide-gray-100">
      {/* Header with avatar, name, team, online status */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.full_name || "User"}
                  width={48}
                  height={48}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-medium text-gray-600">
                  {initials}
                </div>
              )}
            </div>
            {/* Online indicator dot */}
            <span
              className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                online ? "bg-green-500" : "bg-gray-300"
              }`}
              title={online ? "Online" : "Offline"}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 truncate">{profile.full_name}</h3>
              {pinned && (
                <span className="text-[10px] text-gray-400" title="Pinned">📌</span>
              )}
            </div>
            {profile.team && (
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium mt-0.5"
                style={{
                  backgroundColor: profile.team.color + "20",
                  color: profile.team.color,
                }}
              >
                {profile.team.name}
              </span>
            )}
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`inline-flex items-center gap-1 text-xs ${
                  online ? "text-green-600" : "text-gray-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-green-500" : "bg-gray-300"}`} />
                {online ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contact actions */}
      <div className="p-3">
        <div className="flex flex-wrap gap-2">
          {profile.phone && (
            <>
              <a
                href={`tel:${profile.phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                title="Call"
              >
                📞 Anrufen
              </a>
              {whatsAppLink && (
                <a
                  href={whatsAppLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
                  title="WhatsApp"
                >
                  💬 WhatsApp
                </a>
              )}
              <button
                onClick={() => copyToClipboard(profile.phone!, "phone")}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                title={`Copy: ${phoneDisplay}`}
              >
                📋
              </button>
            </>
          )}
          {profile.email && (
            <>
              <a
                href={`mailto:${profile.email}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                title="Email"
              >
                ✉️ E-Mail
              </a>
              <button
                onClick={() => copyToClipboard(profile.email!, "email")}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                title={`Copy: ${profile.email}`}
              >
                📋
              </button>
            </>
          )}
        </div>
        {!profile.phone && !profile.email && (
          <p className="text-xs text-gray-400">Keine Kontaktdaten verfügbar</p>
        )}
      </div>

      {/* Stats grid */}
      <div className="p-3 grid grid-cols-2 gap-2">
        <StatItem label="Anrufe heute" value={stats.callsToday} />
        <StatItem label="Anrufe Woche" value={stats.callsThisWeek} />
        <StatItem label="Beanspruchte TMA" value={stats.claimedTmaCount} />
        <StatItem label="WhatsApp zugewiesen" value={stats.assignedWhatsappCount} />
      </div>
    </div>
  );
});

const StatItem = memo(function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  );
});

