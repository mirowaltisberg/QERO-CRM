"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import type { ChatRoom, ChatMember } from "@/lib/types";

// Special display for CEO
const getDisplayRole = (member: { full_name?: string; team?: { name: string; color: string } | null }) => {
  if (member.full_name === "Arbios Shtanaj") {
    return { name: "CEO", color: "#1a1a1a" };
  }
  return member.team;
};

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
  rooms, members, activeRoomId, onSelectRoom, onStartDM, searchQuery, onSearchChange, loading,
}: ChatRoomListProps) {
  // Get current user's team from members (the one that matches rooms)
  const currentUserTeamId = useMemo(() => {
    const teamRoom = rooms.find(r => r.type === "team");
    return teamRoom?.team_id || null;
  }, [rooms]);

  const { allRoom, teamRooms, dmRooms } = useMemo(() => ({
    allRoom: rooms.find((r) => r.type === "all") || null,
    teamRooms: rooms.filter((r) => r.type === "team"),
    dmRooms: rooms.filter((r) => r.type === "dm"),
  }), [rooms]);

  // Get IDs of users we already have DMs with
  const existingDmUserIds = useMemo(() => {
    return new Set(dmRooms.map((r) => r.dm_user?.id).filter(Boolean));
  }, [dmRooms]);

  // Team members (same team as current user) - shown in Direktnachrichten when no search
  const teamMembers = useMemo(() => {
    if (!currentUserTeamId) return [];
    return members.filter(m => 
      m.team_id === currentUserTeamId && !existingDmUserIds.has(m.id)
    );
  }, [members, currentUserTeamId, existingDmUserIds]);

  // Search results - people from OTHER teams (when searching)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return members.filter((m) =>
      (m.full_name?.toLowerCase().includes(query) || m.team?.name?.toLowerCase().includes(query)) &&
      m.team_id !== currentUserTeamId && // Only show people from other teams in search
      !existingDmUserIds.has(m.id)
    ).slice(0, 10);
  }, [members, searchQuery, currentUserTeamId, existingDmUserIds]);

  if (loading) {
    return (
      <aside className="flex h-full w-72 flex-col border-r border-gray-200 bg-gray-50 items-center justify-center">
        <span className="text-gray-500">Lädt Chats...</span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-72 flex-col border-r border-gray-200 bg-gray-50">
      <header className="border-b border-gray-200 px-4 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Chat</h2>
        <p className="text-xs text-gray-500">Team-Kommunikation</p>
      </header>
      <div className="border-b border-gray-200 px-4 py-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Suche nach Person..."
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {/* Search results - only show when searching */}
        {searchQuery && searchResults.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">Suchergebnisse</p>
            {searchResults.map((member) => (
              <MemberItem key={member.id} member={member} onClick={() => { onStartDM(member.id); onSearchChange(""); }} />
            ))}
          </div>
        )}

        {/* Show no results message */}
        {searchQuery && searchResults.length === 0 && (
          <div className="mb-4 px-2">
            <p className="text-sm text-gray-500">Keine Personen gefunden</p>
          </div>
        )}

        {/* Normal view when not searching */}
        {!searchQuery && (
          <>
            {allRoom && (
              <div className="mb-4">
                <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">Alle</p>
                <RoomItem room={allRoom} isActive={activeRoomId === allRoom.id} onClick={() => onSelectRoom(allRoom)} />
              </div>
            )}
            {teamRooms.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">Teams</p>
                {teamRooms.map((room) => (
                  <RoomItem key={room.id} room={room} isActive={activeRoomId === room.id} onClick={() => onSelectRoom(room)} />
                ))}
              </div>
            )}
            <div className="mb-4">
              <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-gray-400">Direktnachrichten</p>
              {/* Existing DM rooms */}
              {dmRooms.map((room) => (
                <RoomItem key={room.id} room={room} isActive={activeRoomId === room.id} onClick={() => onSelectRoom(room)} />
              ))}
              {/* Team members without DM yet */}
              {teamMembers.map((member) => (
                <MemberItem key={member.id} member={member} onClick={() => onStartDM(member.id)} />
              ))}
              {dmRooms.length === 0 && teamMembers.length === 0 && (
                <p className="px-2 text-sm text-gray-400">Keine Teammitglieder</p>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
});

const RoomItem = memo(function RoomItem({ room, isActive, onClick }: { room: ChatRoom; isActive: boolean; onClick: () => void }) {
  const isDM = room.type === "dm";
  const displayName = isDM && room.dm_user ? room.dm_user.full_name : room.name || "Chat";
  const avatar = isDM && room.dm_user?.avatar_url;
  const team = isDM && room.dm_user ? getDisplayRole(room.dm_user) : null;
  const initials = displayName?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
  const getIcon = () => { if (room.type === "all") return "👥"; if (room.type === "team") return "💼"; return null; };

  return (
    <button onClick={onClick} className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${isActive ? "bg-white shadow-sm border border-gray-200" : "hover:bg-white/60"}`}>
      <div className="flex items-center gap-3">
        {isDM ? (
          <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
            {avatar ? <Image src={avatar} alt={displayName} width={36} height={36} className="h-full w-full object-cover" unoptimized /> : <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-600">{initials}</div>}
          </div>
        ) : (
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg">{getIcon()}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
            {room.unread_count && room.unread_count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium text-white">{room.unread_count > 99 ? "99+" : room.unread_count}</span>
            )}
          </div>
          {team && <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${team.color}20`, color: team.color }}>{team.name}</span>}
          {room.last_message && <p className="mt-0.5 truncate text-xs text-gray-500">{room.last_message.sender?.full_name?.split(" ")[0]}: {room.last_message.content.slice(0, 30)}{room.last_message.content.length > 30 ? "..." : ""}</p>}
        </div>
      </div>
    </button>
  );
});

const MemberItem = memo(function MemberItem({ member, onClick }: { member: ChatMember; onClick: () => void }) {
  const initials = member.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
  return (
    <button onClick={onClick} className="w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/60">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
          {member.avatar_url ? <Image src={member.avatar_url} alt={member.full_name || "User"} width={36} height={36} className="h-full w-full object-cover" unoptimized /> : <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-600">{initials}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{member.full_name}</p>
          {member.team && <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${member.team.color}20`, color: member.team.color }}>{member.team.name}</span>}
        </div>
      </div>
    </button>
  );
});
