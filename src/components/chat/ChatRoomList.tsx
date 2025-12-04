"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import type { ChatRoom, ChatMember } from "@/lib/types";

interface ChatRoomListProps {
  rooms: ChatRoom[];
  members: ChatMember[];
  activeRoomId: string | null;
  onSelectRoom: (room: ChatRoom) => void;
  onStartDM: (userId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading: boolean;
}

export const ChatRoomList = memo(function ChatRoomList({
  rooms,
  members,
  activeRoomId,
  onSelectRoom,
  onStartDM,
  searchQuery,
  onSearchChange,
  loading,
}: ChatRoomListProps) {
  // Separate rooms by type
  const { allRoom, teamRooms, dmRooms } = useMemo(() => {
    const all = rooms.find((r) => r.type === "all") || null;
    const teams = rooms.filter((r) => r.type === "team");
    const dms = rooms.filter((r) => r.type === "dm");
    return { allRoom: all, teamRooms: teams, dmRooms: dms };
  }, [rooms]);

  // Filter members by search (for starting new DMs)
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return members.filter((m) =>
      m.full_name?.toLowerCase().includes(query) ||
      m.team?.name?.toLowerCase().includes(query)
    );
  }, [members, searchQuery]);

  // Members not in existing DMs
  const membersWithoutDM = useMemo(() => {
    const dmUserIds = new Set(dmRooms.map((r) => r.dm_user?.id).filter(Boolean));
    return filteredMembers.filter((m) => !dmUserIds.has(m.id));
  }, [filteredMembers, dmRooms]);

  if (loading) {
    return (
      <aside className="flex h-full w-full md:w-72 flex-col border-r border-gray-200 bg-gray-50">
        <div className="flex h-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-full md:w-72 flex-col md:border-r border-gray-200 bg-gray-50">
      {/* Header */}
      <header 
        className="border-b border-gray-200 px-4 py-4 bg-white md:bg-transparent"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <h2 className="text-xl md:text-lg font-semibold text-gray-900">Chat</h2>
        <p className="text-xs text-gray-500 hidden md:block">Team-Kommunikation</p>
      </header>

      {/* Search */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white md:bg-transparent">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Suchen..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-[16px] md:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
          />
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto px-4 md:p-2">
        {/* All chat */}
        {allRoom && (
          <div className="mb-4">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Alle
            </p>
            <RoomItem
              room={allRoom}
              isActive={activeRoomId === allRoom.id}
              onClick={() => onSelectRoom(allRoom)}
            />
          </div>
        )}

        {/* Team chats */}
        {teamRooms.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Teams
            </p>
            {teamRooms.map((room) => (
              <RoomItem
                key={room.id}
                room={room}
                isActive={activeRoomId === room.id}
                onClick={() => onSelectRoom(room)}
              />
            ))}
          </div>
        )}

        {/* DMs */}
        {dmRooms.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Direktnachrichten
            </p>
            {dmRooms.map((room) => (
              <RoomItem
                key={room.id}
                room={room}
                isActive={activeRoomId === room.id}
                onClick={() => onSelectRoom(room)}
              />
            ))}
          </div>
        )}

        {/* Search results - new DMs */}
        {membersWithoutDM.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Neue Unterhaltung
            </p>
            {membersWithoutDM.map((member) => (
              <MemberItem
                key={member.id}
                member={member}
                onClick={() => onStartDM(member.id)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
});

// Room item component
const RoomItem = memo(function RoomItem({
  room,
  isActive,
  onClick,
}: {
  room: ChatRoom;
  isActive: boolean;
  onClick: () => void;
}) {
  const isDM = room.type === "dm";
  const displayName = isDM && room.dm_user ? room.dm_user.full_name : room.name || "Chat";
  const avatar = isDM && room.dm_user?.avatar_url;
  const team = isDM ? room.dm_user?.team : null;
  const initials = displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  // Icon for non-DM rooms
  const getIcon = () => {
    if (room.type === "all") return "👥";
    if (room.type === "team") return "💼";
    return null;
  };

  const hasMention = room.has_mention && room.unread_count && room.unread_count > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl md:rounded-xl px-2 md:px-3 py-3 md:py-2.5 text-left transition-all active:bg-gray-100 ${
        isActive
          ? "md:bg-white md:shadow-sm md:border md:border-gray-200"
          : hasMention
          ? "bg-blue-50 md:border md:border-blue-200"
          : "md:hover:bg-white/60"
      }`}
    >
      <div className="flex items-center gap-3">
        {isDM ? (
          <div className="h-12 w-12 md:h-9 md:w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
            {avatar ? (
              <Image
                src={avatar}
                alt={displayName}
                width={48}
                height={48}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm md:text-xs font-medium text-gray-600">
                {initials}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-12 w-12 md:h-9 md:w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl md:text-lg">
            {getIcon()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[15px] md:text-sm font-semibold md:font-medium text-gray-900">
              {displayName}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {room.last_message && (
                <span className="text-[13px] md:hidden text-gray-400">
                  {new Date(room.last_message.created_at).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {room.unread_count && room.unread_count > 0 && (
                <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium text-white ${
                  hasMention ? "bg-red-500" : "bg-blue-500"
                }`}>
                  {hasMention ? "@" : room.unread_count > 99 ? "99+" : room.unread_count}
                </span>
              )}
            </div>
          </div>
          {team && (
            <span
              className="hidden md:inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${team.color}20`,
                color: team.color,
              }}
            >
              {team.name}
            </span>
          )}
          {room.last_message && (
            <p className="mt-0.5 truncate text-[13px] md:text-xs text-gray-500">
              <span className="md:hidden">{room.last_message.content.slice(0, 40)}</span>
              <span className="hidden md:inline">{room.last_message.sender?.full_name?.split(" ")[0]}: {room.last_message.content.slice(0, 30)}</span>
              {room.last_message.content.length > 30 ? "..." : ""}
            </p>
          )}
        </div>
      </div>
    </button>
  );
});

// Member item for starting new DMs
const MemberItem = memo(function MemberItem({
  member,
  onClick,
}: {
  member: ChatMember;
  onClick: () => void;
}) {
  const initials = member.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl px-3 py-3 md:py-2.5 text-left transition-colors hover:bg-white/60 active:bg-gray-100 active:scale-[0.98]"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
          {member.avatar_url ? (
            <Image
              src={member.avatar_url}
              alt={member.full_name || "User"}
              width={36}
              height={36}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-600">
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {member.full_name}
          </p>
          {member.team && (
            <span
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${member.team.color}20`,
                color: member.team.color,
              }}
            >
              {member.team.name}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

