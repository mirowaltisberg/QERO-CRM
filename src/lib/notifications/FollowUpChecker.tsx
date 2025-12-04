"use client";

import { useEffect, useRef, useCallback } from "react";
import { useNotifications } from "./NotificationContext";
import { useRouter } from "next/navigation";

interface FollowUp {
  id: string;
  type: "contact" | "tma";
  name: string;
  follow_up_at: string;
  note: string | null;
}

const STORAGE_KEY = "shown_followups";
const CHECK_INTERVAL = 60000; // 60 seconds

export function FollowUpChecker() {
  const { addNotification } = useNotifications();
  const router = useRouter();
  const initialCheckDone = useRef(false);

  const getShownFollowups = useCallback((): Set<string> => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Clean up old entries (older than 24 hours)
        const now = Date.now();
        const cleaned: Record<string, number> = {};
        for (const [key, timestamp] of Object.entries(parsed)) {
          if (now - (timestamp as number) < 24 * 60 * 60 * 1000) {
            cleaned[key] = timestamp as number;
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        return new Set(Object.keys(cleaned));
      }
    } catch {
      // Ignore parse errors
    }
    return new Set();
  }, []);

  const markAsShown = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const data = stored ? JSON.parse(stored) : {};
      data[id] = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore
    }
  }, []);

  const checkFollowups = useCallback(async () => {
    console.log("[FollowUp Checker] Checking for due follow-ups...");
    
    try {
      const res = await fetch("/api/followups");
      if (!res.ok) {
        console.log("[FollowUp Checker] API error:", res.status);
        return;
      }
      
      const json = await res.json();
      const followups: FollowUp[] = json.data || [];
      
      console.log("[FollowUp Checker] Found", followups.length, "due follow-ups");
      
      if (followups.length === 0) return;
      
      const shown = getShownFollowups();
      
      for (const followup of followups) {
        const key = `${followup.type}-${followup.id}`;
        
        if (shown.has(key)) {
          console.log("[FollowUp Checker] Already shown:", key);
          continue;
        }
        
        console.log("[FollowUp Checker] Showing notification for:", followup.name);
        
        addNotification({
          type: "followup",
          title: "Follow-up fällig",
          message: `${followup.name}${followup.note ? `: ${followup.note}` : ""}`,
          onClick: () => {
            if (followup.type === "contact") {
              router.push("/calling");
            } else {
              router.push("/tma");
            }
          },
        });
        
        markAsShown(key);
      }
    } catch (err) {
      console.error("[FollowUp Checker] Error:", err);
    }
  }, [addNotification, router, getShownFollowups, markAsShown]);

  // Initial check after app loads
  useEffect(() => {
    if (initialCheckDone.current) return;
    initialCheckDone.current = true;
    
    console.log("[FollowUp Checker] Initial check in 2 seconds...");
    const timeout = setTimeout(checkFollowups, 2000);
    return () => clearTimeout(timeout);
  }, [checkFollowups]);

  // Periodic checks
  useEffect(() => {
    console.log("[FollowUp Checker] Setting up interval check every", CHECK_INTERVAL / 1000, "seconds");
    const interval = setInterval(checkFollowups, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkFollowups]);

  return null;
}
