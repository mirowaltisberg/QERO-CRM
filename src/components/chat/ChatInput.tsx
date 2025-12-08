"use client";

import { memo, useState, useCallback, useRef, useMemo, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import type { ChatMember, ChatRoom } from "@/lib/types";

// Quick reply emojis
const QUICK_EMOJIS = ["👍", "❤️", "🔥", "😂"];

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
  const [sendingEmoji, setSendingEmoji] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick emoji send handler
  const handleQuickEmoji = useCallback(async (emoji: string) => {
    if (sending || disabled) return;
    setSendingEmoji(emoji);
    setSending(true);
    try {
      await onSend(emoji, [], []);
    } finally {
      setSending(false);
      setSendingEmoji(null);
    }
  }, [onSend, sending, disabled]);

  // Filter members for @ autocomplete (with @everyone option)
  const filteredMembers = useMemo(() => {
    // Filter by room type first
    let availableMembers = members;
    if (activeRoom?.type === "team" && activeRoom.team_id) {
      availableMembers = members.filter(m => m.team_id === activeRoom.team_id);
    } else if (activeRoom?.type === "dm" && activeRoom.dm_user) {
      availableMembers = members.filter(m => m.id === activeRoom.dm_user?.id);
    }

    // Create @everyone option for group chats
    const everyoneOption: ChatMember = {
      id: "everyone",
      full_name: "everyone",
      avatar_url: null,
      team_id: null,
      team: null,
    };

    if (!mentionQuery) {
      // Show @everyone first for non-DM chats
      if (activeRoom?.type !== "dm") {
        return [everyoneOption, ...availableMembers.slice(0, 4)];
      }
      return availableMembers.slice(0, 5);
    }

    const query = mentionQuery.toLowerCase();
    const filtered = availableMembers
      .filter(
        (m) =>
          m.full_name?.toLowerCase().includes(query) ||
          m.team?.name?.toLowerCase().includes(query)
      )
      .slice(0, 5);

    // Add @everyone if it matches query (for non-DM chats)
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

      // Check for @ mentions
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);

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
        `@${member.full_name} ` +
        textAfterCursor;

      setContent(newText);
      setShowMentions(false);
      setMentionQuery("");

      // Focus and move cursor
      setTimeout(() => {
        textarea.focus();
        const newPos = atIndex + member.full_name!.length + 2;
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
          alert(`${file.name} ist zu gross. Maximum: 10MB`);
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

    // Extract mentions from content
    const mentionRegex = /@([A-Za-zÀ-ÿ]+(?: [A-Za-zÀ-ÿ]+)*)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(trimmedContent)) !== null) {
      const mentionName = match[1];
      // Check for @everyone
      if (mentionName.toLowerCase() === "everyone") {
        if (!mentions.includes("everyone")) {
          mentions.push("everyone");
        }
      } else {
        const mentionedMember = members.find(
          (m) => m.full_name?.toLowerCase() === mentionName.toLowerCase()
        );
        if (mentionedMember && !mentions.includes(mentionedMember.id)) {
          mentions.push(mentionedMember.id);
        }
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
        <div className="absolute bottom-full left-0 right-0 md:right-auto mb-2 md:w-64 rounded-xl border border-gray-200 bg-white shadow-lg z-50 max-h-[40vh] overflow-y-auto">
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
                    <div className={`flex h-full w-full items-center justify-center text-[10px] font-medium ${isEveryone ? "text-blue-600 text-base" : "text-gray-600"}`}>
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
                    <p
                      className="truncate text-xs"
                      style={{ color: member.team.color }}
                    >
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

      {/* Quick emoji reactions */}
      <div className="flex items-center justify-center gap-3 mb-3">
        {QUICK_EMOJIS.map((emoji) => (
          <QuickEmojiButton
            key={emoji}
            emoji={emoji}
            onSend={handleQuickEmoji}
            disabled={disabled || sending}
            isSending={sendingEmoji === emoji}
          />
        ))}
      </div>

      {/* Input area */}
      <div className="flex items-end gap-2">
        {/* Text input */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            placeholder="Nachricht schreiben..."
            disabled={disabled}
            rows={1}
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[16px] text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none disabled:opacity-50"
            style={{ minHeight: "44px", maxHeight: "120px" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 active:text-gray-800 disabled:opacity-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
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

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-all ${
            canSend 
              ? "bg-gray-900 text-white active:scale-95" 
              : "bg-gray-100 text-gray-400"
          }`}
        >
          {sending ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
});

// Quick emoji button with hold-to-send animation
function QuickEmojiButton({
  emoji,
  onSend,
  disabled,
  isSending,
}: {
  emoji: string;
  onSend: (emoji: string) => void;
  disabled?: boolean;
  isSending?: boolean;
}) {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [swoosh, setSwoosh] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdDuration = 800; // 0.8 seconds to send
  const progressInterval = 16; // ~60fps

  const startHold = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    
    // Prevent default to avoid long-press context menu on mobile
    e.preventDefault();
    
    setIsHolding(true);
    setProgress(0);

    // Progress animation
    let currentProgress = 0;
    progressIntervalRef.current = setInterval(() => {
      currentProgress += (progressInterval / holdDuration) * 100;
      setProgress(Math.min(currentProgress, 100));
    }, progressInterval);

    // Send after hold duration
    holdTimerRef.current = setTimeout(() => {
      setSwoosh(true);
      setTimeout(() => {
        onSend(emoji);
        setSwoosh(false);
        setIsHolding(false);
        setProgress(0);
      }, 200);
    }, holdDuration);
  }, [emoji, onSend, disabled]);

  const cancelHold = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setIsHolding(false);
    setProgress(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  // Calculate scale based on progress (1 -> 1.4)
  const scale = 1 + (progress / 100) * 0.4;

  return (
    <button
      type="button"
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
      disabled={disabled}
      className={cn(
        "relative flex items-center justify-center w-11 h-11 rounded-full transition-all select-none touch-none",
        "border-2 border-gray-200 bg-white",
        "hover:border-gray-300 hover:bg-gray-50",
        "active:border-gray-400",
        disabled && "opacity-50 cursor-not-allowed",
        isHolding && "border-blue-400 bg-blue-50",
        swoosh && "animate-ping"
      )}
      style={{
        transform: isHolding ? `scale(${scale})` : "scale(1)",
        transition: isHolding ? "transform 0.05s linear" : "transform 0.2s ease-out",
      }}
    >
      {/* Progress ring */}
      {isHolding && progress > 0 && (
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 44 44"
        >
          <circle
            cx="22"
            cy="22"
            r="20"
            fill="none"
            stroke="#3B82F6"
            strokeWidth="3"
            strokeDasharray={`${(progress / 100) * 125.6} 125.6`}
            className="transition-all duration-75"
          />
        </svg>
      )}
      
      {/* Emoji */}
      <span
        className={cn(
          "text-xl transition-transform",
          swoosh && "scale-150 opacity-0"
        )}
        style={{
          transform: swoosh ? "translateY(-20px) scale(1.5)" : undefined,
          transition: "transform 0.2s ease-out, opacity 0.2s ease-out",
        }}
      >
        {isSending ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
        ) : (
          emoji
        )}
      </span>
    </button>
  );
}
