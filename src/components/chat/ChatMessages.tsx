"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import type { ChatMessage, ChatMember } from "@/lib/types";

// Special display for CEO
const getDisplayRole = (name?: string, team?: { name: string; color: string } | null) => {
  if (name === "Arbios Shtanaj") {
    return { name: "CEO", color: "#1a1a1a" };
  }
  return team;
};

interface ChatMessagesProps {
  messages: ChatMessage[];
  members: ChatMember[];
}

export const ChatMessages = memo(function ChatMessages({ messages, members }: ChatMessagesProps) {
  // Create a map of member IDs and a set of member names for mention matching
  const { memberMap, memberNames } = useMemo(() => {
    const map = new Map<string, ChatMember>();
    const names = new Set<string>();
    members.forEach((m) => {
      map.set(m.id, m);
      if (m.full_name) names.add(m.full_name.toLowerCase());
    });
    return { memberMap: map, memberNames: names };
  }, [members]);

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageCard key={message.id} message={message} memberMap={memberMap} memberNames={memberNames} />
      ))}
    </div>
  );
});

const MessageCard = memo(function MessageCard({ 
  message, 
  memberMap,
  memberNames 
}: { 
  message: ChatMessage; 
  memberMap: Map<string, ChatMember>;
  memberNames: Set<string>;
}) {
  const sender = message.sender;
  const initials = sender?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "??";

  // Parse content and highlight only valid member mentions
  const parsedContent = useMemo(() => {
    if (!message.content) return null;
    
    const parts: Array<{ type: "text" | "mention"; value: string }> = [];
    let remaining = message.content;
    
    while (remaining.length > 0) {
      const atIndex = remaining.indexOf("@");
      
      if (atIndex === -1) {
        // No more @ symbols
        parts.push({ type: "text", value: remaining });
        break;
      }
      
      // Add text before @
      if (atIndex > 0) {
        parts.push({ type: "text", value: remaining.slice(0, atIndex) });
      }
      
      // Try to match a member name after @
      const afterAt = remaining.slice(atIndex + 1);
      let foundMatch = false;
      
      // Check each member name to see if the text starts with it
      for (const name of Array.from(memberNames)) {
        if (afterAt.toLowerCase().startsWith(name)) {
          // Make sure it's followed by a non-letter or end of string
          const afterName = afterAt.slice(name.length);
          if (afterName.length === 0 || !/^[A-Za-zÀ-ÿ]/.test(afterName)) {
            // Found a valid mention
            const originalName = afterAt.slice(0, name.length);
            parts.push({ type: "mention", value: "@" + originalName });
            remaining = afterAt.slice(name.length);
            foundMatch = true;
            break;
          }
        }
      }
      
      if (!foundMatch) {
        // No valid mention found, treat @ as regular text
        parts.push({ type: "text", value: "@" });
        remaining = afterAt;
      }
    }
    
    return parts.length > 0 ? parts : [{ type: "text" as const, value: message.content }];
  }, [message.content, memberNames]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
          {sender?.avatar_url ? (
            <Image src={sender.avatar_url} alt={sender.full_name || "User"} width={36} height={36} className="h-full w-full object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-600">{initials}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{sender?.full_name || "Unbekannt"}</span>
            {(() => {
              const role = getDisplayRole(sender?.full_name, sender?.team);
              return role && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: role.color + "20", color: role.color }}>{role.name}</span>
              );
            })()}
            <span className="text-xs text-gray-400">{formatRelativeTime(message.created_at)}</span>
          </div>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
            {parsedContent?.map((part, i) =>
              part.type === "mention" ? (
                <span key={i} className="rounded bg-blue-100 px-1 py-0.5 font-medium text-blue-700">{part.value}</span>
              ) : (
                <span key={i}>{part.value}</span>
              )
            )}
          </p>
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const AttachmentPreview = memo(function AttachmentPreview({ attachment }: { attachment: ChatMessage["attachments"][0] }) {
  const isImage = attachment.file_type?.startsWith("image/");
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (isImage) {
    return (
      <a href={attachment.file_url} target="_blank" rel="noopener noreferrer" className="block max-w-xs overflow-hidden rounded-lg border border-gray-200">
        <img src={attachment.file_url} alt={attachment.file_name} className="h-auto max-h-48 w-full object-cover" />
        <div className="bg-gray-50 px-2 py-1"><p className="truncate text-xs text-gray-600">{attachment.file_name}</p></div>
      </a>
    );
  }

  return (
    <a href={attachment.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition">
      <span className="text-lg">📎</span>
      <div className="min-w-0">
        <p className="truncate font-medium">{attachment.file_name}</p>
        {attachment.file_size && <p className="text-xs text-gray-500">{formatFileSize(attachment.file_size)}</p>}
      </div>
    </a>
  );
});

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "gerade eben";
  if (diffMins < 60) return "vor " + diffMins + " Min.";
  if (diffHours < 24) return "vor " + diffHours + " Std.";
  if (diffDays === 1) return "gestern";
  if (diffDays < 7) return "vor " + diffDays + " Tagen";
  return date.toLocaleDateString("de-CH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
