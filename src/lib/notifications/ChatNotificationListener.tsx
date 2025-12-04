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

export function ChatNotificationListener() {
  const { addNotification } = useNotifications();
  const router = useRouter();
  const pathname = usePathname();
  const currentUserIdRef = useRef<string>("");
  const membersRef = useRef<Map<string, ChatMember>>(new Map());
  const isOnChatPageRef = useRef(false);

  // Track if user is on chat page
  useEffect(() => {
    isOnChatPageRef.current = pathname === "/chat";
  }, [pathname]);

  // Fetch current user and members on mount
  useEffect(() => {
    const supabase = createClient();

    const fetchUserAndMembers = async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        currentUserIdRef.current = user.id;
      }

      // Fetch all members for name lookup
      const res = await fetch("/api/chat/members");
      if (res.ok) {
        const json = await res.json();
        const members: ChatMember[] = json.data || [];
        const map = new Map<string, ChatMember>();
        members.forEach(m => map.set(m.id, m));
        membersRef.current = map;
      }
    };

    fetchUserAndMembers();
  }, []);

  // Subscribe to chat messages globally
  useEffect(() => {
    const supabase = createClient();

    console.log("[Chat Global Listener] Setting up subscription...");

    const channel = supabase
      .channel("global-chat-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          console.log("[Chat Global Listener] New message:", payload.new);

          const newRecord = payload.new as {
            id: string;
            room_id: string;
            sender_id: string;
            content: string;
          };

          // Don't notify for own messages
          if (newRecord.sender_id === currentUserIdRef.current) {
            console.log("[Chat Global Listener] Skipping own message");
            return;
          }

          // Don't notify if already on chat page (ChatView will handle it)
          if (isOnChatPageRef.current) {
            console.log("[Chat Global Listener] Skipping - on chat page");
            return;
          }

          // Get sender info
          const sender = membersRef.current.get(newRecord.sender_id);
          const senderName = sender?.full_name || "Neue Nachricht";

          console.log("[Chat Global Listener] Showing notification for:", senderName);

          addNotification({
            type: "chat",
            title: senderName,
            message: newRecord.content?.slice(0, 100) || "Hat eine Nachricht gesendet",
            avatar: sender?.avatar_url || undefined,
            onClick: () => {
              router.push("/chat");
            },
          });
        }
      )
      .subscribe((status) => {
        console.log("[Chat Global Listener] Subscription status:", status);
      });

    return () => {
      console.log("[Chat Global Listener] Cleaning up subscription");
      supabase.removeChannel(channel);
    };
  }, [addNotification, router]);

  return null;
}
