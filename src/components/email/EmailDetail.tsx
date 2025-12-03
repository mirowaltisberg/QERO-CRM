"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import type { EmailThread, EmailMessage } from "@/lib/types";

interface Props {
  thread: EmailThread | null;
  loading?: boolean;
  onReply: (threadId: string, messageId: string) => void;
  onArchive: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onToggleStar: (threadId: string, starred: boolean) => void;
}

export function EmailDetail({ thread, loading, onReply, onArchive, onDelete, onToggleStar }: Props) {
  const messages = useMemo(() => {
    if (!thread?.messages) return [];
    return [...thread.messages].sort((a, b) => {
      const dateA = new Date(a.received_at || a.sent_at || 0);
      const dateB = new Date(b.received_at || b.sent_at || 0);
      return dateA.getTime() - dateB.getTime();
    });
  }, [thread]);

  if (loading) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gray-50/50">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          <p className="text-sm text-gray-500">Loading email...</p>
        </div>
      </section>
    );
  }

  if (!thread) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gray-50/50">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <EmailIcon className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">Select an email to read</p>
        </div>
      </section>
    );
  }

  const lastMessage = messages[messages.length - 1];

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-gray-900">
            {thread.subject || "(no subject)"}
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {messages.length} message{messages.length !== 1 ? "s" : ""} in this thread
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleStar(thread.id, !thread.is_starred)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100"
            title={thread.is_starred ? "Unstar" : "Star"}
          >
            <StarIcon filled={thread.is_starred} />
          </button>
          <button
            onClick={() => onArchive(thread.id)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100"
            title="Archive"
          >
            <ArchiveIcon />
          </button>
          <button
            onClick={() => onDelete(thread.id)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-red-500"
            title="Delete"
          >
            <TrashIcon />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            isLast={index === messages.length - 1}
          />
        ))}
      </div>

      {/* Reply bar */}
      {lastMessage && (
        <footer className="border-t border-gray-200 px-6 py-3">
          <Button
            onClick={() => onReply(thread.id, lastMessage.graph_message_id)}
            className="w-full"
          >
            <ReplyIcon className="mr-2 h-4 w-4" />
            Reply
          </Button>
        </footer>
      )}
    </section>
  );
}

interface MessageBubbleProps {
  message: EmailMessage;
  isLast: boolean;
}

function MessageBubble({ message, isLast }: MessageBubbleProps) {
  const senderInitials = (message.sender_name || message.sender_email)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Rewrite cid: URLs in HTML to point to our attachment endpoint
  const processedHtml = useMemo(() => {
    if (!message.body_html) return null;
    
    let html = message.body_html;
    
    // Replace cid: references with our API endpoint
    // Pattern: src="cid:xxxxx" or src='cid:xxxxx'
    html = html.replace(
      /src=["']cid:([^"']+)["']/gi,
      (match, contentId) => {
        // Create URL to fetch the inline attachment
        const url = `/api/email/attachments/inline?cid=${encodeURIComponent(contentId)}&messageId=${encodeURIComponent(message.graph_message_id)}`;
        return `src="${url}"`;
      }
    );
    
    return sanitizeHtml(html);
  }, [message.body_html, message.graph_message_id]);

  return (
    <article
      className={cn(
        "rounded-2xl border bg-white p-4 transition",
        isLast ? "border-gray-200 shadow-sm" : "border-gray-100"
      )}
    >
      {/* Sender info */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
          {senderInitials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {message.sender_name || message.sender_email}
          </p>
          <p className="truncate text-xs text-gray-500">
            to {message.recipients?.join(", ") || "unknown"}
            {message.cc && message.cc.length > 0 && (
              <span className="text-gray-400"> · cc: {message.cc.join(", ")}</span>
            )}
          </p>
        </div>
        <time className="text-xs text-gray-400 whitespace-nowrap">
          {formatDateTime(message.received_at || message.sent_at)}
        </time>
      </div>

      {/* Body */}
      <div className="mt-4">
        {processedHtml ? (
          <div
            className="prose prose-sm max-w-none text-gray-700 [&_img]:max-w-full [&_img]:h-auto"
            dangerouslySetInnerHTML={{ __html: processedHtml }}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {message.body_text || message.body_preview}
          </p>
        )}
      </div>

      {/* Attachments */}
      {message.has_attachments && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-2">
            <AttachmentIcon className="h-4 w-4" />
            Attachments
          </p>
          <AttachmentsList messageId={message.graph_message_id} />
        </div>
      )}
    </article>
  );
}

// Component to fetch and display attachments
function AttachmentsList({ messageId }: { messageId: string }) {
  // For now, just show a placeholder - in a full implementation, 
  // we'd fetch the attachments list from our DB or Graph API
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`/api/email/attachments/list?messageId=${encodeURIComponent(messageId)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
      >
        <DownloadIcon className="h-3.5 w-3.5" />
        View attachments
      </a>
    </div>
  );
}

function sanitizeHtml(html: string): string {
  // Basic sanitization - in production, use DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function formatDateTime(isoDate: string | null): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: diffDays > 365 ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg className="h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function ReplyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}

function AttachmentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

