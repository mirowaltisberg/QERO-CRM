"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotifications } from "./NotificationContext";
import { useRouter, usePathname } from "next/navigation";

interface ChatMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface LatestMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

const POLL_INTERVAL = 10000; // 10 seconds
const STORAGE_KEY = "last_seen_chat_message";

export function ChatNotificationListener() {
  const { addNotification } = useNotifications();
  const router = useRouter();
  const pathname = usePathname();
  const currentUserIdRef = useRef<string>("");
  const membersRef = useRef<Map<string, ChatMember>>(new Map());
  const initializedRef = useRef(false);

  const getLastSeenMessageId = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  }, []);

  const setLastSeenMessageId = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  // Fetch current user and members on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const supabase = createClient();

    const init = async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        currentUserIdRef.current = user.id;
        console.log("[Chat Notif] Current user:", user.id);
      }

      // Fetch all members for name lookup
      try {
        const res = await fetch("/api/chat/members");
        if (res.ok) {
          const json = await res.json();
          const members: ChatMember[] = json.data || [];
          const map = new Map<string, ChatMember>();
          members.forEach(m => map.set(m.id, m));
          membersRef.current = map;
          console.log("[Chat Notif] Loaded", members.length, "members");
        }
      } catch (err) {
        console.error("[Chat Notif] Failed to load members:", err);
      }
    };

    init();
  }, []);

  // Poll for new messages
  const checkForNewMessages = useCallback(async () => {
    // Skip if on chat page
    if (pathname === "/chat") {
      return;
    }

    if (!currentUserIdRef.current) {
      return;
    }

    try {
      // Get the latest message from any room I'm a member of
      const res = await fetch("/api/chat/latest-message");
      if (!res.ok) return;

      const json = await res.json();
      const latestMessage: LatestMessage | null = json.data;

      if (!latestMessage) return;

      const lastSeenId = getLastSeenMessageId();
      
      // On first run, just set the ID
      if (!lastSeenId) {
        setLastSeenMessageId(latestMessage.id);
        return;
      }

      // If same message, no notification needed
      if (lastSeenId === latestMessage.id) {
        return;
      }

      // Skip if message is from current user
      if (latestMessage.sender_id === currentUserIdRef.current) {
        setLastSeenMessageId(latestMessage.id);
        return;
      }

      // Show notification
      const sender = membersRef.current.get(latestMessage.sender_id);
      const senderName = sender?.full_name || "Neue Nachricht";

      console.log("[Chat Notif] New message from:", senderName);

      addNotification({
        type: "chat",
        title: senderName,
        message: latestMessage.content?.slice(0, 100) || "Hat eine Nachricht gesendet",
        avatar: sender?.avatar_url || undefined,
        onClick: () => {
          router.push("/chat");
        },
      });

      setLastSeenMessageId(latestMessage.id);
    } catch (err) {
      console.error("[Chat Notif] Error checking messages:", err);
    }
  }, [pathname, addNotification, router, getLastSeenMessageId, setLastSeenMessageId]);

  // Initial check and set up polling
  useEffect(() => {
    // Initial check after 3 seconds
    const initialTimeout = setTimeout(checkForNewMessages, 3000);

    // Poll every 10 seconds
    const interval = setInterval(checkForNewMessages, POLL_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [checkForNewMessages]);

  return null;
}
