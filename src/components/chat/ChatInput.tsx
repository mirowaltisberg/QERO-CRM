"use client";

import { memo, useState, useCallback, useRef, useMemo, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { ChatMember, ChatRoom } from "@/lib/types";

// Special display for CEO
const getDisplayRole = (member: ChatMember) => {
  if (member.full_name === "Arbios Shtanaj") {
    return { name: "CEO", color: "#1a1a1a" };
  }
  return member.team;
};

interface ChatInputProps {
  members: ChatMember[];
  activeRoom: ChatRoom | null;
  onSend: (
    content: string,
    mentions: string[],
    attachments: Array<{
      file_name: string;
      file_url: string;
      file_type: string;
      file_size: number;
    }>
  ) => Promise<void>;
  disabled?: boolean;
}

interface PendingAttachment {
  file: File;
  preview?: string;
  uploading: boolean;
  uploaded?: {
    file_name: string;
    file_url: string;
    file_type: string;
    file_size: number;
  };
  error?: string;
}

export const ChatInput = memo(function ChatInput({
  members,
  activeRoom,
  onSend,
  disabled,
}: ChatInputProps) {
  const [content, setContent] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter members based on room type and search query
  const filteredMembers = useMemo(() => {
    let availableMembers = members;
    
    // Filter by room type
    if (activeRoom?.type === "team" && activeRoom.team_id) {
      // In team chat, only show members of that team
      availableMembers = members.filter(m => m.team_id === activeRoom.team_id);
    } else if (activeRoom?.type === "dm" && activeRoom.dm_user) {
      // In DM, only show the other person
      availableMembers = members.filter(m => m.id === activeRoom.dm_user?.id);
    }
    // In "all" chat, show everyone
    
    // Add @everyone option for group chats (not DMs)
    const everyoneOption: ChatMember = {
      id: "everyone",
      full_name: "everyone",
      avatar_url: null,
      team_id: null,
      team: null,
    };
    
    // Apply search filter
    if (!mentionQuery) {
      // Show @everyone first for group chats
      if (activeRoom?.type !== "dm") {
        return [everyoneOption, ...availableMembers.slice(0, 4)];
      }
      return availableMembers.slice(0, 5);
    }
    
    const query = mentionQuery.toLowerCase();
    const filtered = availableMembers
      .filter((m) => m.full_name?.toLowerCase().includes(query))
      .slice(0, 5);
    
    // Add @everyone if it matches query
    if (activeRoom?.type !== "dm" && "everyone".includes(query)) {
      return [everyoneOption, ...filtered.slice(0, 4)];
    }
    return filtered;
  }, [members, mentionQuery, activeRoom]);

  // Handle content change
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setContent(value);

      // Check for @ mentions - match @ followed by any characters until space or end
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@([^@]*)$/);

      if (atMatch) {
        setShowMentions(true);
        setMentionQuery(atMatch[1]);
        setMentionIndex(0);
      } else {
        setShowMentions(false);
        setMentionQuery("");
      }
    },
    []
  );

  // Handle keyboard navigation in mentions
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showMentions) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((prev) =>
            Math.min(prev + 1, filteredMembers.length - 1)
          );
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selectedMember = filteredMembers[mentionIndex];
          if (selectedMember) {
            insertMention(selectedMember);
          }
        } else if (e.key === "Escape") {
          setShowMentions(false);
        }
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [showMentions, filteredMembers, mentionIndex]
  );

  // Insert a mention into the textarea
  const insertMention = useCallback(
    (member: ChatMember) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = content.slice(0, cursorPos);
      const textAfterCursor = content.slice(cursorPos);

      // Find the @ symbol position
      const atIndex = textBeforeCursor.lastIndexOf("@");
      const newText =
        textBeforeCursor.slice(0, atIndex) +
        "@" + member.full_name + " " +
        textAfterCursor;

      setContent(newText);
      setShowMentions(false);
      setMentionQuery("");

      // Focus and move cursor
      setTimeout(() => {
        textarea.focus();
        const newPos = atIndex + (member.full_name?.length || 0) + 2;
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [content]
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // Reset input
      e.target.value = "";

      for (const file of files) {
        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert(file.name + " ist zu gross. Maximum: 10MB");
          continue;
        }

        // Create preview for images
        let preview: string | undefined;
        if (file.type.startsWith("image/")) {
          preview = URL.createObjectURL(file);
        }

        // Add to pending attachments
        const attachment: PendingAttachment = {
          file,
          preview,
          uploading: true,
        };
        setAttachments((prev) => [...prev, attachment]);

        // Upload file
        try {
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/chat/attachments", {
            method: "POST",
            body: formData,
          });

          const json = await res.json();

          if (res.ok && json.data) {
            setAttachments((prev) =>
              prev.map((a) =>
                a.file === file
                  ? {
                      ...a,
                      uploading: false,
                      uploaded: json.data,
                    }
                  : a
              )
            );
          } else {
            setAttachments((prev) =>
              prev.map((a) =>
                a.file === file
                  ? {
                      ...a,
                      uploading: false,
                      error: json.error || "Upload fehlgeschlagen",
                    }
                  : a
              )
            );
          }
        } catch {
          setAttachments((prev) =>
            prev.map((a) =>
              a.file === file
                ? {
                    ...a,
                    uploading: false,
                    error: "Upload fehlgeschlagen",
                  }
                : a
            )
          );
        }
      }
    },
    []
  );

  // Remove attachment
  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const attachment = prev[index];
      // Revoke object URL if it exists
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Send message
  const handleSend = useCallback(async () => {
    const trimmedContent = content.trim();
    const uploadedAttachments = attachments
      .filter((a) => a.uploaded)
      .map((a) => a.uploaded!);

    if (!trimmedContent && uploadedAttachments.length === 0) return;
    if (sending) return;

    // Extract mentions from content - match @Name Surname pattern
    const mentions: string[] = [];
    // Find all @mentions by looking for @ followed by text until we hit another @ or end
    const mentionRegex = /@([A-Za-zÀ-ÿ]+(?: [A-Za-zÀ-ÿ]+)*)/g;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(trimmedContent)) !== null) {
      const mentionName = match[1];
      const mentionedMember = members.find(
        (m) => m.full_name?.toLowerCase() === mentionName.toLowerCase()
      );
      if (mentionedMember) {
        mentions.push(mentionedMember.id);
      }
    }

    setSending(true);
    try {
      await onSend(trimmedContent, mentions, uploadedAttachments);
      setContent("");
      setAttachments([]);
    } finally {
      setSending(false);
    }
  }, [content, attachments, members, onSend, sending]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.preview) URL.revokeObjectURL(a.preview);
      });
    };
  }, []);

  const canSend =
    (content.trim() || attachments.some((a) => a.uploaded)) &&
    !sending &&
    !disabled;

  return (
    <div className="relative">
      {/* Mention autocomplete dropdown */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
          {filteredMembers.map((member, index) => {
            const isEveryone = member.id === "everyone";
            const initials = isEveryone ? "👥" : (member.full_name
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2) || "?");

            return (
              <button
                key={member.id}
                onClick={() => insertMention(member)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                  index === mentionIndex ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <div className={`h-7 w-7 flex-shrink-0 overflow-hidden rounded-full ${isEveryone ? "bg-blue-100" : "bg-gray-200"}`}>
                  {member.avatar_url ? (
                    <Image
                      src={member.avatar_url}
                      alt={member.full_name || ""}
                      width={28}
                      height={28}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className={`flex h-full w-full items-center justify-center font-medium ${isEveryone ? "text-blue-600 text-base" : "text-gray-600 text-[10px]"}`}>
                      {initials}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${isEveryone ? "text-blue-600" : "text-gray-900"}`}>
                    {isEveryone ? "@everyone" : member.full_name}
                  </p>
                  {isEveryone ? (
                    <p className="truncate text-xs text-gray-500">Alle benachrichtigen</p>
                  ) : member.team ? (
                    <p className="truncate text-xs" style={{ color: member.team.color }}>
                      {member.team.name}
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className="relative rounded-lg border border-gray-200 bg-gray-50 p-2"
            >
              {attachment.preview ? (
                <img
                  src={attachment.preview}
                  alt={attachment.file.name}
                  className="h-16 w-16 rounded object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded bg-gray-100">
                  <span className="text-2xl">📎</span>
                </div>
              )}
              {attachment.uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              )}
              {attachment.error && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-red-500/50">
                  <span className="text-xs text-white">!</span>
                </div>
              )}
              <button
                onClick={() => removeAttachment(index)}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-xs text-white hover:bg-gray-700"
              >
                ×
              </button>
              <p className="mt-1 max-w-16 truncate text-[10px] text-gray-600">
                {attachment.file.name}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            placeholder="Nachricht schreiben... (@erwähnen mit @)"
            disabled={disabled}
            rows={1}
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 pr-24 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            style={{ minHeight: "48px", maxHeight: "200px" }}
          />
          {/* Attachment button inside textarea */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="absolute right-14 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            title="Datei anhängen"
          >
            📎
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        />

        <Button
          onClick={handleSend}
          disabled={!canSend}
          className="h-12 px-6"
        >
          {sending ? "..." : "Senden"}
        </Button>
      </div>
    </div>
  );
});
