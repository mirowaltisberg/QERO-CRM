"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { ChatRoomList } from "./ChatRoomList";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { createClient } from "@/lib/supabase/client";
import type { ChatRoom, ChatMessage, ChatMember } from "@/lib/types";

export const ChatView = memo(function ChatView() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const activeRoomRef = useRef<ChatRoom | null>(null);
  const membersRef = useRef<ChatMember[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep refs in sync
  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  // Fetch rooms on mount
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/rooms");
      const json = await res.json();
      if (json.data) {
        setRooms(json.data);
        if (!activeRoomRef.current && json.data.length > 0) {
          setActiveRoom(json.data[0]);
        }
      }
    } catch (err) {
      console.error("Error fetching rooms:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch members on mount
  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/members");
      const json = await res.json();
      if (json.data) setMembers(json.data);
    } catch (err) {
      console.error("Error fetching members:", err);
    }
  }, []);

  // Fetch messages when room changes
  const fetchMessages = useCallback(async (roomId: string) => {
    try {
      const res = await fetch("/api/chat/rooms/" + roomId + "/messages?limit=50");
      const json = await res.json();
      if (json.data) setMessages(json.data);
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    fetchRooms();
    fetchMembers();
  }, [fetchRooms, fetchMembers]);

  // Load messages when active room changes
  useEffect(() => {
    if (activeRoom) {
      fetchMessages(activeRoom.id);
    } else {
      setMessages([]);
    }
  }, [activeRoom, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Real-time subscription
  useEffect(() => {
    const supabase = createClient();
    
    const channel = supabase
      .channel("chat-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      }, async (payload) => {
        console.log("[Chat] New message received:", payload);
        const newRecord = payload.new as { id: string; room_id: string; sender_id: string; content: string; mentions: string[]; created_at: string };
        
        const currentRoom = activeRoomRef.current;
        console.log("[Chat] Current room:", currentRoom?.id, "Message room:", newRecord.room_id);
        
        // Refresh rooms (for unread counts later)
        fetchRooms();
        
        // If message is for active room, add it directly
        if (currentRoom && newRecord.room_id === currentRoom.id) {
          console.log("[Chat] Adding message to current room");
          // Find sender info from members ref
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
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      })
      .subscribe((status) => {
        console.log("[Chat] Subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRooms]);

  const handleSendMessage = async (
    content: string,
    mentions: string[],
    attachments: Array<{ file_name: string; file_url: string; file_type: string; file_size: number }>
  ) => {
    if (!activeRoom) return;
    try {
      const res = await fetch("/api/chat/rooms/" + activeRoom.id + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mentions, attachments }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        // Add our own message immediately (realtime will handle others)
        setMessages(prev => {
          if (prev.some(m => m.id === json.data.id)) return prev;
          return [...prev, json.data];
        });
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const handleSelectRoom = (room: ChatRoom) => {
    setActiveRoom(room);
  };

  const handleStartDM = async (userId: string) => {
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        await fetchRooms();
        const newRoom = rooms.find(r => r.id === json.data.id);
        if (newRoom) setActiveRoom(newRoom);
        else {
          const refreshRes = await fetch("/api/chat/rooms");
          const refreshJson = await refreshRes.json();
          if (refreshJson.data) {
            setRooms(refreshJson.data);
            const found = refreshJson.data.find((r: ChatRoom) => r.id === json.data.id);
            if (found) setActiveRoom(found);
          }
        }
      }
    } catch (err) {
      console.error("Error starting DM:", err);
    }
  };

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
          onSelectRoom={handleSelectRoom}
          onStartDM={handleStartDM}
          searchQuery=""
          onSearchChange={() => {}}
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
