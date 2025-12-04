"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChatRoomList } from "./ChatRoomList";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { createClient } from "@/lib/supabase/client";
import type { ChatRoom, ChatMessage, ChatMember } from "@/lib/types";

export function ChatView() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/rooms");
      const json = await res.json();
      if (res.ok && json.data) {
        setRooms(json.data);
        if (!activeRoom && json.data.length > 0) {
          setActiveRoom(json.data[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching rooms:", error);
    } finally {
      setLoading(false);
    }
  }, [activeRoom]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/members");
      const json = await res.json();
      if (res.ok && json.data) setMembers(json.data);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  }, []);

  const fetchMessages = useCallback(async (roomId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages`);
      const json = await res.json();
      if (res.ok && json.data) setMessages(json.data);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    fetchMembers();
  }, [fetchRooms, fetchMembers]);

  useEffect(() => {
    if (activeRoom) fetchMessages(activeRoom.id);
  }, [activeRoom, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Real-time subscription
  useEffect(() => {
    if (!activeRoom) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-messages-${activeRoom.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `room_id=eq.${activeRoom.id}`,
      }, async () => {
        const res = await fetch(`/api/chat/rooms/${activeRoom.id}/messages?limit=1`);
        const json = await res.json();
        if (res.ok && json.data && json.data.length > 0) {
          const newMessage = json.data[json.data.length - 1];
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeRoom]);

  const handleSendMessage = async (
    content: string,
    mentions: string[],
    attachments: Array<{ file_name: string; file_url: string; file_type: string; file_size: number }>
  ) => {
    if (!activeRoom) return;
    try {
      const res = await fetch(`/api/chat/rooms/${activeRoom.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mentions, attachments }),
      });
      const json = await res.json();
      if (res.ok && json.data) setMessages((prev) => [...prev, json.data]);
    } catch (error) {
      console.error("Error sending message:", error);
    }
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
        const roomsRes = await fetch("/api/chat/rooms");
        const roomsJson = await roomsRes.json();
        if (roomsRes.ok && roomsJson.data) {
          setRooms(roomsJson.data);
          const newRoom = roomsJson.data.find((r: ChatRoom) => r.id === json.data.id);
          if (newRoom) setActiveRoom(newRoom);
        }
      }
    } catch (error) {
      console.error("Error starting DM:", error);
    }
  };

  const getRoomDisplayName = (room: ChatRoom | null) => {
    if (!room) return "";
    if (room.type === "dm" && room.dm_user) return room.dm_user.full_name;
    return room.name || "Chat";
  };

  return (
    <div className="flex h-full">
      <ChatRoomList
        rooms={rooms}
        members={members}
        activeRoomId={activeRoom?.id || null}
        onSelectRoom={setActiveRoom}
        onStartDM={handleStartDM}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        loading={loading}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{getRoomDisplayName(activeRoom)}</h1>
            {activeRoom?.type === "dm" && activeRoom.dm_user?.team && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium mt-1"
                style={{ backgroundColor: `${activeRoom.dm_user.team.color}20`, color: activeRoom.dm_user.team.color }}>
                {activeRoom.dm_user.team.name}
              </span>
            )}
            {activeRoom?.type === "team" && <p className="text-sm text-gray-500">Team Chat</p>}
            {activeRoom?.type === "all" && <p className="text-sm text-gray-500">Alle Teammitglieder</p>}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messagesLoading ? (
            <div className="flex h-full items-center justify-center text-gray-500">Lädt Nachrichten...</div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-gray-500">Noch keine Nachrichten.</div>
          ) : (
            <>
              <ChatMessages messages={messages} members={members} />
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        <div className="border-t border-gray-200 px-6 py-4">
          <ChatInput members={members} onSend={handleSendMessage} disabled={!activeRoom} />
        </div>
      </div>
    </div>
  );
}
