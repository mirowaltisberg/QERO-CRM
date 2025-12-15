"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
  onBack?: () => void;
  isMobile?: boolean;
}

export function EmailDetail({ thread, loading, onReply, onArchive, onDelete, onToggleStar, onBack, isMobile = false }: Props) {
  const t = useTranslations("email");
  const tCommon = useTranslations("common");
  
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
      <section className={cn(
        "flex flex-1 items-center justify-center bg-gray-50/50",
        isMobile && "h-full"
      )}>
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          <p className="text-sm text-gray-500">Loading email...</p>
        </div>
      </section>
    );
  }

  if (!thread) {
    return (
      <section className={cn(
        "flex flex-1 items-center justify-center bg-gray-50/50",
        isMobile && "h-full"
      )}>
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <EmailIcon className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">{t("selectEmail")}</p>
        </div>
      </section>
    );
  }

  const lastMessage = messages[messages.length - 1];

  return (
    <section className={cn(
      "flex flex-1 flex-col overflow-hidden",
      isMobile && "h-full"
    )}>
      {/* Header */}
      <header 
        className="flex items-center justify-between border-b border-gray-200 px-4 py-3"
        style={isMobile ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" } : undefined}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {isMobile && onBack && (
            <button
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 -ml-1 flex-shrink-0"
            >
              <BackIcon className="h-5 w-5 text-gray-600" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-gray-900">
              {thread.subject || t("noSubject")}
            </h1>
            <p className="mt-0.5 text-xs text-gray-500">
              {t("messagesInThread", { count: messages.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleStar(thread.id, !thread.is_starred)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
            title={thread.is_starred ? t("unstar") : t("star")}
          >
            <StarIcon filled={thread.is_starred} />
          </button>
          <button
            onClick={() => onArchive(thread.id)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
            title={t("archive")}
          >
            <ArchiveIcon />
          </button>
          <button
            onClick={() => onDelete(thread.id)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-red-500"
            title={tCommon("delete")}
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
            threadParticipants={thread.participants || []}
            t={t}
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
            {t("reply")}
          </Button>
        </footer>
      )}
    </section>
  );
}

interface MessageBubbleProps {
  message: EmailMessage;
  isLast: boolean;
  threadParticipants: string[];
}

function MessageBubble({
  message,
  isLast,
  threadParticipants,
  t,
}: MessageBubbleProps & { t: (key: string, values?: Record<string, string>) => string }) {
  const [hydrated, setHydrated] = useState<EmailMessage | null>(null);
  const [hydrating, setHydrating] = useState(false);

  const effective = hydrated || message;

  const needsHydration =
    (!!message.graph_message_id && (!message.body_html && !message.body_text)) ||
    (Array.isArray(message.recipients) && message.recipients.length === 0);

  const inferRecipientsFallback = useCallback((): string[] => {
    if (!threadParticipants || threadParticipants.length === 0) return [];
    const senderEmail = (effective.sender_email || "").toLowerCase();
    const emails = threadParticipants
      .map((p) => {
        const m = p.match(/<([^>]+)>/);
        return (m?.[1] || p).trim();
      })
      .filter((e) => e.includes("@"));

    const filtered = emails.filter((e) => e.toLowerCase() !== senderEmail);
    // Dedup while preserving order
    const seen = new Set<string>();
    return filtered.filter((e) => {
      const k = e.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [threadParticipants, effective.sender_email]);

  useEffect(() => {
    if (!needsHydration) return;
    if (!message.graph_message_id) return;
    if (hydrated || hydrating) return;

    setHydrating(true);
    (async () => {
      try {
        const res = await fetch(`/api/email/message/${encodeURIComponent(message.graph_message_id)}/hydrate`, {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok) return;
        if (json.data?.persisted === true && json.data?.message?.id) {
          setHydrated(json.data.message);
        }
      } catch (err) {
        // Best-effort; fall back to preview
        console.error("Failed to hydrate email:", err);
      } finally {
        setHydrating(false);
      }
    })();
  }, [needsHydration, message.graph_message_id, hydrated, hydrating]);

  const senderInitials = ((effective.sender_name || effective.sender_email || "") as string)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Rewrite cid: URLs in HTML to point to our attachment endpoint
  const processedHtml = useMemo(() => {
    if (!effective.body_html) return null;
    
    let html = effective.body_html;
    
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
  }, [effective.body_html, effective.graph_message_id]);

  const recipientsDisplay =
    (effective.recipients && effective.recipients.length > 0
      ? effective.recipients
      : inferRecipientsFallback()).join(", ");

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
            {effective.sender_name || effective.sender_email}
          </p>
          <p className="truncate text-xs text-gray-500">
            {t("to")} {recipientsDisplay || t("unknown")}
            {effective.cc && effective.cc.length > 0 && (
              <span className="text-gray-400"> · {t("cc")}: {effective.cc.join(", ")}</span>
            )}
          </p>
        </div>
        <time className="text-xs text-gray-400 whitespace-nowrap">
          {formatDateTime(effective.received_at || effective.sent_at, t)}
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
            {effective.body_text || effective.body_preview}
          </p>
        )}
      </div>

      {/* Attachments */}
      {effective.has_attachments && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-2">
            <AttachmentIcon className="h-4 w-4" />
            {t("attachments")}
          </p>
          <AttachmentsList messageId={effective.graph_message_id} />
        </div>
      )}
    </article>
  );
}

// Component to fetch and display attachments
function AttachmentsList({ messageId }: { messageId: string }) {
  const t = useTranslations("email");
  const [attachments, setAttachments] = useState<Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAttachments() {
      try {
        const res = await fetch(`/api/email/attachments/list?messageId=${encodeURIComponent(messageId)}`);
        if (!res.ok) {
          throw new Error("Failed to load attachments");
        }
        const json = await res.json();
        setAttachments(json.data?.attachments || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    fetchAttachments();
  }, [messageId]);

  if (loading) {
    return (
      <div className="text-xs text-gray-400">{t("loadingAttachments")}</div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-500">{error}</div>
    );
  }

  if (attachments.length === 0) {
    return (
      <div className="text-xs text-gray-400">{t("noAttachments")}</div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((att) => (
        <a
          key={att.id}
          href={`/api/email/attachments/${encodeURIComponent(att.id)}?messageId=${encodeURIComponent(messageId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
          title={`${att.name} (${formatFileSize(att.size)})`}
        >
          <FileIcon contentType={att.contentType} />
          <span className="max-w-[150px] truncate">{att.name}</span>
          <span className="text-gray-400">({formatFileSize(att.size)})</span>
        </a>
      ))}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ contentType }: { contentType: string }) {
  const iconClass = "h-3.5 w-3.5";
  
  if (contentType.startsWith("image/")) {
    return (
      <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    );
  }
  
  if (contentType === "application/pdf") {
    return (
      <svg className={cn(iconClass, "text-red-500")} fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-2.5 9.5c0 .83-.67 1.5-1.5 1.5h-1v2H7v-6h2c.83 0 1.5.67 1.5 1.5v1zm5 0c0 .83-.67 1.5-1.5 1.5h-1v2h-1v-6h2c.83 0 1.5.67 1.5 1.5v1zm4-1.5h-1v1h1v1h-1v2h-1v-6h2v2z" />
      </svg>
    );
  }

  return <DownloadIcon className={iconClass} />;
}

function sanitizeHtml(html: string): string {
  // Basic sanitization - in production, use DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function formatDateTime(isoDate: string | null, t: (key: string, values?: Record<string, string>) => string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

  if (diffDays === 0) {
    return t("todayAt", { time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
  }
  if (diffDays === 1) {
    return t("yesterdayAt", { time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
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

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
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

