"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { ChatRoomList } from "./ChatRoomList";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { createClient } from "@/lib/supabase/client";
import { chatCache } from "@/lib/chat-cache";
import type { ChatRoom, ChatMessage, ChatMember } from "@/lib/types";

export const ChatView = memo(function ChatView() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");
  
  // Refs to access latest state in subscription callbacks
  const activeRoomRef = useRef<ChatRoom | null>(null);
  const membersRef = useRef<ChatMember[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep refs in sync
  useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/rooms");
      const json = await res.json();
      if (json.data) {
        setRooms(json.data);
        if (!activeRoomRef.current && json.data.length > 0) {
          setActiveRoom(json.data[0]);
        }
        // Prefetch messages for all rooms
        const roomIds = json.data.map((r: ChatRoom) => r.id);
        chatCache.prefetchAll(roomIds);
      }
    } catch (err) {
      console.error("Error fetching rooms:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch members and current user
  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/members");
      const json = await res.json();
      if (json.data) {
        setMembers(json.data);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          const currentMember = json.data.find((m: ChatMember) => m.id === user.id);
          if (currentMember) setCurrentUserName(currentMember.full_name || "");
        }
      }
    } catch (err) {
      console.error("Error fetching members:", err);
    }
  }, []);

  // Fetch messages for a room
  const fetchMessages = useCallback(async (roomId: string) => {
    // Show cached instantly
    const cached = chatCache.get(roomId);
    if (cached) setMessages(cached);

    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages?limit=50`);
      const json = await res.json();
      if (json.data) {
        setMessages(json.data);
        chatCache.set(roomId, json.data);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRooms();
    fetchMembers();
  }, [fetchRooms, fetchMembers]);

  // Load messages when room changes
  useEffect(() => {
    if (activeRoom) {
      fetchMessages(activeRoom.id);
    } else {
      setMessages([]);
    }
  }, [activeRoom, fetchMessages]);

  // REAL-TIME SUBSCRIPTION - ONE GLOBAL SUBSCRIPTION
  useEffect(() => {
    const supabase = createClient();
    
    console.log("[Chat RT] Setting up realtime subscription...");
    
    const channel = supabase
      .channel("chat-global-realtime", {
        config: { broadcast: { self: true } }
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      }, (payload) => {
        console.log("[Chat RT] INSERT received:", payload.new);
        
        const newRecord = payload.new as {
          id: string;
          room_id: string;
          sender_id: string;
          content: string;
          mentions: string[];
          created_at: string;
        };

        // Always refresh rooms (for unread counts, last message, etc.)
        fetchRooms();

        // If this message is for the active room, add it instantly
        const currentRoom = activeRoomRef.current;
        if (currentRoom && newRecord.room_id === currentRoom.id) {
          const sender = membersRef.current.find(m => m.id === newRecord.sender_id);
          
          const newMessage: ChatMessage = {
            id: newRecord.id,
            room_id: newRecord.room_id,
            sender_id: newRecord.sender_id,
            content: newRecord.content,
            mentions: newRecord.mentions || [],
            created_at: newRecord.created_at,
            updated_at: newRecord.created_at,
            sender: {
              id: sender?.id || newRecord.sender_id,
              full_name: sender?.full_name || "Unknown",
              avatar_url: sender?.avatar_url || null,
              team_id: sender?.team_id || null,
              team: sender?.team ? { name: sender.team.name, color: sender.team.color } : null,
            },
            attachments: [],
          };

          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === newMessage.id)) return prev;
            const updated = [...prev, newMessage];
            chatCache.set(currentRoom.id, updated);
            return updated;
          });
        }
        
        // Update cache for the room
        chatCache.addMessage(newRecord.room_id, payload.new);
      })
      .subscribe((status) => {
        console.log("[Chat RT] Subscription status:", status);
      });

    return () => {
      console.log("[Chat RT] Cleaning up subscription");
      supabase.removeChannel(channel);
    };
  }, [fetchRooms]); // Only depend on fetchRooms

  // SEND MESSAGE with optimistic update
  const handleSendMessage = useCallback(async (
    content: string,
    mentions: string[],
    attachments: Array<{ file_name: string; file_url: string; file_type: string; file_size: number }>
  ) => {
    if (!activeRoom || !currentUserId) return;

    // Create optimistic message
    const optimisticId = `optimistic-${Date.now()}`;
    const currentMember = membersRef.current.find(m => m.id === currentUserId);
    
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      room_id: activeRoom.id,
      sender_id: currentUserId,
      content,
      mentions,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sender: {
        id: currentUserId,
        full_name: currentMember?.full_name || currentUserName || "You",
        avatar_url: currentMember?.avatar_url || null,
        team_id: currentMember?.team_id || null,
        team: currentMember?.team || null,
      },
      attachments: attachments.map((a, i) => ({
        id: `att-${i}`,
        message_id: optimisticId,
        ...a,
      })),
    };

    // Add optimistic message immediately
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const res = await fetch(`/api/chat/rooms/${activeRoom.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mentions, attachments }),
      });
      
      const json = await res.json();
      
      if (res.ok && json.data) {
        // Replace optimistic message with real one
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== optimisticId);
          // Check if real message already added by realtime
          if (filtered.some(m => m.id === json.data.id)) return filtered;
          const updated = [...filtered, json.data];
          chatCache.set(activeRoom.id, updated);
          return updated;
        });
      } else {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        console.error("Failed to send message:", json.error);
      }
    } catch (err) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      console.error("Error sending message:", err);
    }
  }, [activeRoom, currentUserId, currentUserName]);

  const handleSelectRoom = useCallback((room: ChatRoom) => {
    setActiveRoom(room);
  }, []);

  const handleStartDM = useCallback(async (userId: string) => {
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        await fetchRooms();
        // Find and select the new/existing room
        const refreshRes = await fetch("/api/chat/rooms");
        const refreshJson = await refreshRes.json();
        if (refreshJson.data) {
          setRooms(refreshJson.data);
          const found = refreshJson.data.find((r: ChatRoom) => r.id === json.data.id);
          if (found) setActiveRoom(found);
        }
      }
    } catch (err) {
      console.error("Error starting DM:", err);
    }
  }, [fetchRooms]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="w-80 border-r border-gray-200 bg-white">
        <ChatRoomList
          rooms={rooms}
          activeRoomId={activeRoom?.id || null}
          members={members}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onSelectRoom={handleSelectRoom}
          onStartDM={handleStartDM}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          loading={loading}
        />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {activeRoom?.type === "dm" && activeRoom.dm_user
              ? activeRoom.dm_user.full_name
              : activeRoom?.name || "Chat"}
          </h2>
          <p className="text-sm text-gray-500">
            {activeRoom?.type === "all"
              ? "Alle Teammitglieder"
              : activeRoom?.type === "team"
              ? "Team Chat"
              : activeRoom?.dm_user?.team?.name || "Direct Message"}
          </p>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <ChatMessages messages={messages} members={members} />
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t border-gray-200 bg-white p-4">
          <ChatInput
            members={members}
            activeRoom={activeRoom}
            onSend={handleSendMessage}
            disabled={!activeRoom}
          />
        </div>
      </div>
    </div>
  );
});
