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
  
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  
  // Refs to prevent subscription recreation
  const activeRoomRef = useRef<ChatRoom | null>(null);
  const subscriptionRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  
  // Keep activeRoomRef in sync
  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile && mobileView === "chat" && !activeRoom) {
        setMobileView("list");
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [mobileView, activeRoom]);

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

  // Stable realtime subscription - only recreate when room ID changes
  useEffect(() => {
    if (!activeRoom) return;
    
    const roomId = activeRoom.id;
    const supabase = createClient();
    
    // Clean up previous subscription if exists
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
    }
    
    const channel = supabase.channel(`chat-room-${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          console.log("[Chat Realtime] New message received:", payload.new);
          const newMsg = payload.new as { id: string; content: string; sender_id: string; created_at: string };
          
          // Fetch full message with sender info
          const res = await fetch(`/api/chat/rooms/${roomId}/messages?limit=1`);
          const json = await res.json();
          if (res.ok && json.data && json.data.length > 0) {
            const fullMsg = json.data.find((m: ChatMessage) => m.id === newMsg.id) || json.data[0];
            setMessages(prev => {
              if (prev.some(m => m.id === fullMsg.id)) return prev;
              return [...prev, fullMsg];
            });
          }
          
          // Update room list
          fetch("/api/chat/rooms").then(r => r.json()).then(j => {
            if (j.data) setRooms(j.data);
          });
        })
      .subscribe((status) => {
        console.log("[Chat Realtime] Subscription status:", status);
      });
    
    subscriptionRef.current = channel;
    
    return () => { 
      console.log("[Chat Realtime] Cleaning up subscription for room:", roomId);
      supabase.removeChannel(channel);
      subscriptionRef.current = null;
    };
  }, [activeRoom?.id]); // Only depend on room ID, not the whole object

  const handleSelectRoom = useCallback((room: ChatRoom) => {
    setActiveRoom(room);
    if (isMobile) {
      setMobileView("chat");
    }
  }, [isMobile]);

  const handleBack = useCallback(() => {
    setMobileView("list");
  }, []);

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
            if (isMobile) setMobileView("chat");
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
      <div className="fixed inset-0 z-50 bg-gray-50">
        {/* Room List */}
        <div
          className={`absolute inset-0 bg-gray-50 transition-transform duration-300 ease-out ${
            mobileView === "chat" ? "-translate-x-full" : "translate-x-0"
          }`}
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

        {/* Chat View */}
        <div
          className={`absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-out ${
            mobileView === "chat" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Header */}
          <header 
            className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
          >
            <button 
              onClick={handleBack}
              className="flex items-center justify-center w-8 h-8 -ml-2 rounded-lg text-gray-600 active:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            {activeRoom?.type === "dm" && activeRoom.dm_user?.avatar_url ? (
              <img src={activeRoom.dm_user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
                {activeRoom?.type === "all" ? "👥" : activeRoom?.type === "team" ? "💼" : "👤"}
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold text-gray-900 truncate">
                {getRoomDisplayName(activeRoom)}
              </h1>
              <p className="text-xs text-gray-500">
                {activeRoom?.type === "all" ? "Alle Teammitglieder" : activeRoom?.type === "team" ? "Team Chat" : ""}
              </p>
            </div>
          </header>

          {/* Messages */}
          <div 
            className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {messagesLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-gray-400">
                <span className="text-3xl mb-2">💬</span>
                <p className="text-sm">Noch keine Nachrichten</p>
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
            className="flex-shrink-0 px-4 py-3 bg-white border-t border-gray-200"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
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
