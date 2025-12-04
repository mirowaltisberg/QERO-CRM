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
  
  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [showMessages, setShowMessages] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/rooms");
      const json = await res.json();
      if (res.ok && json.data) {
        setRooms(json.data);
        if (!activeRoom && json.data.length > 0 && !isMobile) {
          setActiveRoom(json.data[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching rooms:", error);
    } finally {
      setLoading(false);
    }
  }, [activeRoom, isMobile]);

  // Fetch members
  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/members");
      const json = await res.json();
      if (res.ok && json.data) setMembers(json.data);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  }, []);

  // Fetch messages
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

  useEffect(() => { fetchRooms(); fetchMembers(); }, [fetchRooms, fetchMembers]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("chat-global")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => fetchRooms())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRooms]);

  useEffect(() => {
    if (activeRoom) fetchMessages(activeRoom.id);
  }, [activeRoom, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeRoom) return;
    const supabase = createClient();
    const channel = supabase.channel(`chat-${activeRoom.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${activeRoom.id}` },
        async (payload) => {
          const newId = (payload.new as { id: string }).id;
          const res = await fetch(`/api/chat/rooms/${activeRoom.id}/messages?limit=50`);
          const json = await res.json();
          if (res.ok && json.data) {
            const newMsg = json.data.find((m: ChatMessage) => m.id === newId);
            if (newMsg) setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
          }
          fetchRooms();
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeRoom, fetchRooms]);

  const handleSelectRoom = useCallback((room: ChatRoom) => {
    setActiveRoom(room);
    if (isMobile) setShowMessages(true);
  }, [isMobile]);

  const handleBack = useCallback(() => setShowMessages(false), []);

  const handleSendMessage = async (content: string, mentions: string[], attachments: Array<{ file_name: string; file_url: string; file_type: string; file_size: number; }>) => {
    if (!activeRoom) return;
    try {
      const res = await fetch(`/api/chat/rooms/${activeRoom.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mentions, attachments }),
      });
      const json = await res.json();
      if (res.ok && json.data) setMessages(prev => [...prev, json.data]);
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
        const roomsRes = await fetch("/api/chat/rooms");
        const roomsJson = await roomsRes.json();
        if (roomsRes.ok && roomsJson.data) {
          setRooms(roomsJson.data);
          const newRoom = roomsJson.data.find((r: ChatRoom) => r.id === json.data.id);
          if (newRoom) {
            setActiveRoom(newRoom);
            if (isMobile) setShowMessages(true);
          }
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

  // ==================== MOBILE ====================
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Room List */}
        <div
          className={`absolute inset-0 bg-white transition-transform duration-300 ease-out ${showMessages ? "-translate-x-full" : "translate-x-0"}`}
        >
          <ChatRoomList
            rooms={rooms}
            members={members}
            activeRoomId={activeRoom?.id || null}
            onSelectRoom={handleSelectRoom}
            onStartDM={handleStartDM}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            loading={loading}
          />
        </div>

        {/* Messages */}
        <div
          className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-out ${showMessages ? "translate-x-0" : "translate-x-full"}`}
          style={{ backgroundColor: "#ece5dd" }}
        >
          {/* Header - WhatsApp green */}
          <header 
            className="flex items-center gap-3 px-2 py-2 flex-shrink-0"
            style={{ 
              backgroundColor: "#075e54",
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)"
            }}
          >
            <button onClick={handleBack} className="p-2 -ml-1 text-white active:opacity-70">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden flex-shrink-0">
              {activeRoom?.type === "dm" && activeRoom.dm_user?.avatar_url ? (
                <img src={activeRoom.dm_user.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg">{activeRoom?.type === "all" ? "👥" : activeRoom?.type === "team" ? "💼" : "👤"}</span>
              )}
            </div>
            
            <div className="flex-1 min-w-0 text-white">
              <h1 className="text-[17px] font-medium truncate">{getRoomDisplayName(activeRoom)}</h1>
              <p className="text-[13px] opacity-80">
                {activeRoom?.type === "all" ? "Alle" : activeRoom?.type === "team" ? "Team" : "online"}
              </p>
            </div>
          </header>

          {/* Messages area - scrollable */}
          <div 
            className="flex-1 overflow-y-auto px-3 py-2"
            style={{ 
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain"
            }}
          >
            {messagesLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-300 border-t-[#075e54]" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-gray-500">
                <span className="text-4xl mb-2">💬</span>
                <p>Noch keine Nachrichten</p>
              </div>
            ) : (
              <>
                <ChatMessages messages={messages} members={members} />
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div 
            className="flex-shrink-0 px-2 py-2"
            style={{ 
              backgroundColor: "#f0f0f0",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)"
            }}
          >
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
  }

  // ==================== DESKTOP ====================
  return (
    <div className="flex h-full">
      <ChatRoomList
        rooms={rooms}
        members={members}
        activeRoomId={activeRoom?.id || null}
        onSelectRoom={handleSelectRoom}
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
            <div className="flex h-full items-center justify-center text-gray-500">Lädt...</div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-gray-500">Noch keine Nachrichten</div>
          ) : (
            <>
              <ChatMessages messages={messages} members={members} />
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        <div className="border-t border-gray-200 px-6 py-4">
          <ChatInput members={members} activeRoom={activeRoom} onSend={handleSendMessage} disabled={!activeRoom} />
        </div>
      </div>
    </div>
  );
}
