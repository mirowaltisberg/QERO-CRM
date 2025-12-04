"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotifications } from "./NotificationContext";
import { useRouter } from "next/navigation";

interface ChatMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export function ChatNotificationListener() {
  const { addNotification } = useNotifications();
  const router = useRouter();
  const currentUserIdRef = useRef<string>("");
  const membersRef = useRef<Map<string, ChatMember>>(new Map());
  const subscriptionSetUp = useRef(false);
  const addNotificationRef = useRef(addNotification);
  const routerRef = useRef(router);

  // Keep refs updated
  useEffect(() => {
    addNotificationRef.current = addNotification;
    routerRef.current = router;
  }, [addNotification, router]);

  // Fetch current user and members on mount
  useEffect(() => {
    const supabase = createClient();

    const fetchUserAndMembers = async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        currentUserIdRef.current = user.id;
        console.log("[Chat Global Listener] Current user:", user.id);
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
          console.log("[Chat Global Listener] Loaded", members.length, "members");
        }
      } catch (err) {
        console.error("[Chat Global Listener] Failed to load members:", err);
      }
    };

    fetchUserAndMembers();
  }, []);

  // Subscribe to chat messages globally - only once
  useEffect(() => {
    if (subscriptionSetUp.current) {
      console.log("[Chat Global Listener] Subscription already set up, skipping");
      return;
    }
    subscriptionSetUp.current = true;

    const supabase = createClient();
    console.log("[Chat Global Listener] Setting up subscription...");

    const channel = supabase
      .channel("global-chat-notifications-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          console.log("[Chat Global Listener] New message received:", payload.new);

          const newRecord = payload.new as {
            id: string;
            room_id: string;
            sender_id: string;
            content: string;
          };

          // Don't notify for own messages
          if (newRecord.sender_id === currentUserIdRef.current) {
            console.log("[Chat Global Listener] Skipping - own message");
            return;
          }

          // Get sender info
          const sender = membersRef.current.get(newRecord.sender_id);
          const senderName = sender?.full_name || "Neue Nachricht";

          console.log("[Chat Global Listener] Showing notification from:", senderName);

          addNotificationRef.current({
            type: "chat",
            title: senderName,
            message: newRecord.content?.slice(0, 100) || "Hat eine Nachricht gesendet",
            avatar: sender?.avatar_url || undefined,
            onClick: () => {
              routerRef.current.push("/chat");
            },
          });
        }
      )
      .subscribe((status) => {
        console.log("[Chat Global Listener] Subscription status:", status);
      });

    // Don't clean up on re-renders - keep subscription alive
    return () => {
      // Only clean up on actual unmount (app closing)
      // The subscription will be cleaned up by Supabase when the page is closed
    };
  }, []); // Empty dependency array - run only once

  return null;
}
