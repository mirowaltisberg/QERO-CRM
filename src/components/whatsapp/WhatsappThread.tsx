"use client";

import { memo, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import type { WhatsAppMessage, WhatsAppMedia, WhatsAppMessageStatus } from "@/lib/types";

interface WhatsappThreadProps {
  messages: WhatsAppMessage[];
  loading?: boolean;
  onLoadMore?: () => void;
}

export const WhatsappThread = memo(function WhatsappThread({
  messages,
  loading,
  onLoadMore,
}: WhatsappThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageId = useRef<string | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.id !== lastMessageId.current) {
      lastMessageId.current = lastMsg.id;
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: Array<{ date: string; messages: WhatsAppMessage[] }> = [];
    let currentDate = "";

    for (const msg of messages) {
      const msgDate = new Date(msg.created_at).toLocaleDateString("de-CH", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }

    return groups;
  }, [messages]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-green-500" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
        <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p>Keine Nachrichten</p>
        <p className="text-sm">Senden Sie eine Nachricht, um die Konversation zu starten</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {onLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="mx-auto block rounded-full bg-gray-100 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-200"
        >
          {loading ? "Laden..." : "Ältere Nachrichten laden"}
        </button>
      )}

      {groupedMessages.map((group) => (
        <div key={group.date}>
          {/* Date separator */}
          <div className="flex items-center justify-center py-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
              {group.date}
            </span>
          </div>

          {/* Messages */}
          <div className="space-y-2">
            {group.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

const MessageBubble = memo(function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const isOutbound = message.direction === "outbound";
  const time = new Date(message.created_at).toLocaleTimeString("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
          isOutbound
            ? "rounded-br-md bg-green-100 text-gray-900"
            : "rounded-bl-md bg-white border border-gray-200 text-gray-900"
        }`}
      >
        {/* Template badge */}
        {message.template_name && (
          <div className="mb-1 flex items-center gap-1 text-xs text-gray-500">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Template: {message.template_name}</span>
          </div>
        )}

        {/* Media attachments */}
        {message.media && message.media.length > 0 && (
          <div className="mb-2 space-y-2">
            {message.media.map((media) => (
              <MediaPreview key={media.id} media={media} />
            ))}
          </div>
        )}

        {/* Message body */}
        {message.body && (
          <p className="whitespace-pre-wrap text-sm">{message.body}</p>
        )}

        {/* Footer: time + status */}
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="text-[10px] text-gray-500">{time}</span>
          {isOutbound && <StatusIcon status={message.status} />}
        </div>

        {/* Error message */}
        {message.status === "failed" && message.error_message && (
          <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
            {message.error_message}
          </div>
        )}
      </div>
    </div>
  );
});

const MediaPreview = memo(function MediaPreview({ media }: { media: WhatsAppMedia }) {
  const isImage = media.mime_type.startsWith("image/");
  const isAudio = media.mime_type.startsWith("audio/");
  const isVideo = media.mime_type.startsWith("video/");

  if (isImage && media.storage_url) {
    return (
      <a href={media.storage_url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={media.storage_url}
          alt={media.file_name || "Bild"}
          className="max-h-48 rounded-lg object-cover"
        />
      </a>
    );
  }

  if (isAudio && media.storage_url) {
    return (
      <audio controls className="max-w-full">
        <source src={media.storage_url} type={media.mime_type} />
      </audio>
    );
  }

  if (isVideo && media.storage_url) {
    return (
      <video controls className="max-h-48 rounded-lg">
        <source src={media.storage_url} type={media.mime_type} />
      </video>
    );
  }

  // Document or other file
  return (
    <a
      href={media.storage_url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 hover:bg-gray-100"
    >
      <span className="text-xl">📄</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{media.file_name || "Dokument"}</p>
        {media.file_size && (
          <p className="text-xs text-gray-500">{formatFileSize(media.file_size)}</p>
        )}
      </div>
    </a>
  );
});

const StatusIcon = memo(function StatusIcon({ status }: { status: WhatsAppMessageStatus }) {
  switch (status) {
    case "pending":
      return (
        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "sent":
      return (
        <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 16 11">
          <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.329-.139.465.465 0 0 0-.338.134.426.426 0 0 0-.102.68l2.757 2.608a.456.456 0 0 0 .329.132c.128 0 .25-.053.339-.148l6.483-7.932a.416.416 0 0 0 .141-.324.46.46 0 0 0-.131-.33.423.423 0 0 0-.319-.14l.45-.001z" fill="currentColor"/>
        </svg>
      );
    case "delivered":
      return (
        <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 16 11">
          <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.329-.139.465.465 0 0 0-.338.134.426.426 0 0 0-.102.68l2.757 2.608a.456.456 0 0 0 .329.132c.128 0 .25-.053.339-.148l6.483-7.932a.416.416 0 0 0 .141-.324.46.46 0 0 0-.131-.33.423.423 0 0 0-.319-.14l.45-.001z" fill="currentColor"/>
          <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.405-1.272-.707.707 1.757 1.608a.456.456 0 0 0 .329.132c.128 0 .25-.053.339-.148l6.483-7.932a.416.416 0 0 0 .141-.324.46.46 0 0 0-.131-.33.423.423 0 0 0-.319-.14l.388-.013z" fill="currentColor"/>
        </svg>
      );
    case "read":
      return (
        <svg className="h-3.5 w-3.5 text-blue-500" viewBox="0 0 16 11">
          <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.329-.139.465.465 0 0 0-.338.134.426.426 0 0 0-.102.68l2.757 2.608a.456.456 0 0 0 .329.132c.128 0 .25-.053.339-.148l6.483-7.932a.416.416 0 0 0 .141-.324.46.46 0 0 0-.131-.33.423.423 0 0 0-.319-.14l.45-.001z" fill="currentColor"/>
          <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.405-1.272-.707.707 1.757 1.608a.456.456 0 0 0 .329.132c.128 0 .25-.053.339-.148l6.483-7.932a.416.416 0 0 0 .141-.324.46.46 0 0 0-.131-.33.423.423 0 0 0-.319-.14l.388-.013z" fill="currentColor"/>
        </svg>
      );
    case "failed":
      return (
        <svg className="h-3.5 w-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return null;
  }
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}







