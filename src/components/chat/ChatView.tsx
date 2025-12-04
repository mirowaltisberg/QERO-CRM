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

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
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
        // Select first room if none selected (only on desktop)
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

  // Fetch members for @ mentions
  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/members");
      const json = await res.json();
      if (res.ok && json.data) {
        setMembers(json.data);
      }
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  }, []);

  // Fetch messages for active room
  const fetchMessages = useCallback(async (roomId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages`);
      const json = await res.json();
      if (res.ok && json.data) {
        setMessages(json.data);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRooms();
    fetchMembers();
  }, [fetchRooms, fetchMembers]);

  // Global subscription for all chat messages (to update unread counts)
  useEffect(() => {
    const supabase = createClient();

    const globalChannel = supabase
      .channel("chat-global")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          console.log("[Chat Global] New message in system:", payload);
          fetchRooms();
        }
      )
      .subscribe((status) => {
        console.log("[Chat Global] Subscription status:", status);
      });

    return () => {
      supabase.removeChannel(globalChannel);
    };
  }, [fetchRooms]);

  // Load messages when room changes
  useEffect(() => {
    if (activeRoom) {
      fetchMessages(activeRoom.id);
    }
  }, [activeRoom, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Real-time subscription for messages
  useEffect(() => {
    if (!activeRoom) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`chat-messages-${activeRoom.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${activeRoom.id}`,
        },
        async (payload) => {
          console.log("[Chat Realtime] New message payload:", payload);
          const newRecord = payload.new as { id: string; sender_id: string };
          
          const res = await fetch(`/api/chat/rooms/${activeRoom.id}/messages?limit=50`);
          const json = await res.json();
          if (res.ok && json.data) {
            const newMessage = json.data.find((m: ChatMessage) => m.id === newRecord.id);
            if (newMessage) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMessage.id)) return prev;
                return [...prev, newMessage];
              });
            }
          }
          
          fetchRooms();
        }
      )
      .subscribe((status) => {
        console.log("[Chat Realtime] Subscription status:", status);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[Chat Realtime] Subscription failed:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRoom, fetchRooms]);

  // Handle room selection
  const handleSelectRoom = useCallback((room: ChatRoom) => {
    setActiveRoom(room);
    if (isMobile) {
      setShowMessages(true);
    }
  }, [isMobile]);

  // Handle back button on mobile
  const handleBack = useCallback(() => {
    setShowMessages(false);
  }, []);

  // Send message handler
  const handleSendMessage = async (
    content: string,
    mentions: string[],
    attachments: Array<{
      file_name: string;
      file_url: string;
      file_type: string;
      file_size: number;
    }>
  ) => {
    if (!activeRoom) return;

    try {
      const res = await fetch(`/api/chat/rooms/${activeRoom.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mentions, attachments }),
      });

      const json = await res.json();
      if (res.ok && json.data) {
        setMessages((prev) => [...prev, json.data]);
      } else {
        console.error("Error sending message:", json.error);
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Start DM with a user
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
        const roomId = json.data.id;
        const room = rooms.find((r) => r.id === roomId);
        if (room) {
          setActiveRoom(room);
          if (isMobile) setShowMessages(true);
        } else {
          const roomsRes = await fetch("/api/chat/rooms");
          const roomsJson = await roomsRes.json();
          if (roomsRes.ok && roomsJson.data) {
            setRooms(roomsJson.data);
            const newRoom = roomsJson.data.find((r: ChatRoom) => r.id === roomId);
            if (newRoom) {
              setActiveRoom(newRoom);
              if (isMobile) setShowMessages(true);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error starting DM:", error);
    }
  };

  // Get room display name
  const getRoomDisplayName = (room: ChatRoom | null) => {
    if (!room) return "";
    if (room.type === "dm" && room.dm_user) {
      return room.dm_user.full_name;
    }
    return room.name || "Chat";
  };

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="relative h-[100dvh] w-full overflow-hidden bg-gray-50">
        {/* Room List - Slides out when showMessages is true */}
        <div
          className={`absolute inset-0 transition-transform duration-300 ease-out ${
            showMessages ? "-translate-x-full" : "translate-x-0"
          }`}
        >
          <div className="h-full overflow-hidden bg-white">
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
        </div>

        {/* Messages View - Slides in from right */}
        <div
          className={`absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-out ${
            showMessages ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Mobile Header with Back Button */}
          <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 safe-area-top">
            <button
              onClick={handleBack}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              <svg className="h-6 w-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-gray-900 truncate">
                {getRoomDisplayName(activeRoom)}
              </h1>
              {activeRoom?.type === "dm" && activeRoom.dm_user?.team && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: `${activeRoom.dm_user.team.color}20`,
                    color: activeRoom.dm_user.team.color,
                  }}
                >
                  {activeRoom.dm_user.team.name}
                </span>
              )}
              {activeRoom?.type === "team" && (
                <p className="text-sm text-gray-500">Team Chat</p>
              )}
              {activeRoom?.type === "all" && (
                <p className="text-sm text-gray-500">Alle Teammitglieder</p>
              )}
            </div>
          </header>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messagesLoading ? (
              <div className="flex h-full items-center justify-center text-gray-500">
                Lädt Nachrichten...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-500">
                Noch keine Nachrichten. Schreib die erste!
              </div>
            ) : (
              <>
                <ChatMessages messages={messages} members={members} />
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area - Sticky at bottom */}
          <div className="border-t border-gray-200 px-4 py-3 safe-area-bottom bg-white">
            <ChatInput
              members={members}
              onSend={handleSendMessage}
              disabled={!activeRoom}
            />
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout (unchanged)
  return (
    <div className="flex h-full">
      {/* Left sidebar - Room list */}
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

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Room header */}
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {getRoomDisplayName(activeRoom)}
            </h1>
            {activeRoom?.type === "dm" && activeRoom.dm_user?.team && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium mt-1"
                style={{
                  backgroundColor: `${activeRoom.dm_user.team.color}20`,
                  color: activeRoom.dm_user.team.color,
                }}
              >
                {activeRoom.dm_user.team.name}
              </span>
            )}
            {activeRoom?.type === "team" && (
              <p className="text-sm text-gray-500">Team Chat</p>
            )}
            {activeRoom?.type === "all" && (
              <p className="text-sm text-gray-500">Alle Teammitglieder</p>
            )}
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messagesLoading ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              Lädt Nachrichten...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              Noch keine Nachrichten. Schreib die erste!
            </div>
          ) : (
            <>
              <ChatMessages messages={messages} members={members} />
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 px-6 py-4">
          <ChatInput
            members={members}
            onSend={handleSendMessage}
            disabled={!activeRoom}
          />
        </div>
      </div>
    </div>
  );
}
