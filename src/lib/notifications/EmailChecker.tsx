"use client";

import { useEffect, useRef, useCallback } from "react";
import { useNotifications } from "./NotificationContext";
import { useRouter } from "next/navigation";

interface EmailThread {
  id: string;
  subject: string;
  participants: string | string[] | null;
  last_message_at: string;
}

const STORAGE_KEY = "last_seen_email_time";
const CHECK_INTERVAL = 60000; // 60 seconds

export function EmailChecker() {
  const { addNotification } = useNotifications();
  const router = useRouter();
  const checkedRef = useRef(false);

  const getLastSeenTime = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }, []);

  const setLastSeenTime = useCallback((time: string) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, time);
    } catch {
      // Ignore
    }
  }, []);

  const checkEmails = useCallback(async () => {
    try {
      // Fetch recent threads
      const res = await fetch("/api/email/threads?folder=inbox&limit=5");
      if (!res.ok) return;
      
      const json = await res.json();
      const threads: EmailThread[] = json.data?.threads || [];
      
      if (threads.length === 0) return;
      
      const lastSeen = getLastSeenTime();
      const now = new Date().toISOString();
      
      // On first run, just set the timestamp without notifications
      if (!lastSeen) {
        setLastSeenTime(now);
        return;
      }
      
      // Find new emails since last check
      const lastSeenDate = new Date(lastSeen);
      const newThreads = threads.filter(t => new Date(t.last_message_at) > lastSeenDate);
      
      // Show notifications for new emails (max 3)
      for (const thread of newThreads.slice(0, 3)) {
        // Extract sender name from participants (handle string, array, or null)
        let sender = "Neue E-Mail";
        if (Array.isArray(thread.participants)) {
          sender = thread.participants[0]?.trim() || sender;
        } else if (typeof thread.participants === "string") {
          sender = thread.participants.split(",")[0]?.trim() || sender;
        }
        
        addNotification({
          type: "email",
          title: sender,
          message: thread.subject || "Kein Betreff",
          onClick: () => {
            router.push("/email");
          },
        });
      }
      
      // Update last seen time
      if (newThreads.length > 0) {
        setLastSeenTime(now);
      }
    } catch (err) {
      console.error("Email check error:", err);
    }
  }, [addNotification, router, getLastSeenTime, setLastSeenTime]);

  useEffect(() => {
    // Initial check after a delay
    if (!checkedRef.current) {
      checkedRef.current = true;
      const timeout = setTimeout(checkEmails, 5000);
      return () => clearTimeout(timeout);
    }
  }, [checkEmails]);

  useEffect(() => {
    // Periodic check
    const interval = setInterval(checkEmails, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkEmails]);

  return null;
}
