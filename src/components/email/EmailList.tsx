"use client";

import { memo, useState, useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import type { EmailThread, EmailFolder } from "@/lib/types";

interface LiveResultThread extends EmailThread {
  is_live_result?: boolean;
  graph_message_id?: string;
}

interface Props {
  threads: LiveResultThread[];
  selectedId: string | null;
  loading: boolean;
  loadingMore: boolean;
  syncing: boolean;
  error: string | null;
  searchQuery: string;
  searchSource: "db" | "graph" | null;
  folder: EmailFolder;
  mailbox: string;
  lastSyncAt: string | null;
  hasMore: boolean;
  total: number;
  onSearchChange: (query: string) => void;
  onSelect: (id: string, isLiveResult?: boolean, graphMessageId?: string) => void;
  onSync: () => void;
  onToggleStar: (id: string, starred: boolean) => void;
  onLoadMore: () => void;
}

const FOLDER_LABELS: Record<EmailFolder, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  trash: "Trash",
};

export const EmailList = memo(function EmailList({
  threads,
  selectedId,
  loading,
  loadingMore,
  syncing,
  error,
  searchQuery,
  searchSource,
  folder,
  mailbox,
  lastSyncAt,
  hasMore,
  total,
  onSearchChange,
  onSelect,
  onSync,
  onToggleStar,
  onLoadMore,
}: Props) {
  // Use client-side only rendering for relative times to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <aside className="flex h-full w-80 flex-col border-r border-gray-200 bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">{FOLDER_LABELS[folder]}</p>
            <p className="text-sm font-semibold text-gray-900">{threads.length} emails</p>
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700",
              syncing && "animate-pulse"
            )}
            title="Sync emails"
          >
            <SyncIcon className={cn("h-4 w-4", syncing && "animate-spin")} />
          </button>
        </div>
        <p className="mt-1 truncate text-xs text-gray-400" title={mailbox}>
          {mailbox}
        </p>
        {mounted && lastSyncAt && (
          <p className="text-[10px] text-gray-400">
            Last sync: {formatRelativeTime(lastSyncAt)}
          </p>
        )}
        <div className="mt-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search emails..."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0"
          />
        </div>
      </header>

      {/* Error state */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && threads.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            <p className="text-xs text-gray-500">Loading emails...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && threads.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <EmptyIcon className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">No emails in {FOLDER_LABELS[folder].toLowerCase()}</p>
          <button
            onClick={onSync}
            className="mt-2 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            Sync now
          </button>
        </div>
      )}

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {threads.map((thread) => {
          const isActive = thread.id === selectedId;
          const isUnread = !thread.is_read;

          return (
            <button
              key={thread.id}
              onClick={() => onSelect(thread.id, thread.is_live_result, thread.graph_message_id)}
              className={cn(
                "group w-full rounded-2xl border px-3 py-2.5 text-left transition",
                isActive
                  ? "border-gray-200 bg-white shadow"
                  : "border-transparent bg-white/70 hover:border-gray-200"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isUnread && (
                      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                    )}
                    <p
                      className={cn(
                        "truncate text-sm",
                        isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"
                      )}
                    >
                      {getSenderDisplay(thread)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-sm",
                      isUnread ? "font-medium text-gray-800" : "text-gray-600"
                    )}
                  >
                    {thread.subject || "(no subject)"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {thread.snippet}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {mounted && thread.last_message_at && (
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      {formatDate(thread.last_message_at)}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(thread.id, !thread.is_starred);
                    }}
                    className={cn(
                      "opacity-0 group-hover:opacity-100 transition",
                      thread.is_starred && "opacity-100"
                    )}
                  >
                    <StarIcon filled={thread.is_starred} />
                  </button>
                </div>
              </div>
              {thread.has_attachments && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                  <AttachmentIcon className="h-3 w-3" />
                  <span>Attachment</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
});

function getSenderDisplay(thread: EmailThread): string {
  if (!thread.participants || thread.participants.length === 0) {
    return "Unknown";
  }
  const sender = thread.participants[0];
  // Extract name part if email format
  const match = sender.match(/^(.+?)\s*<.+>$/);
  if (match) return match[1];
  // Just return email username
  return sender.split("@")[0];
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
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
    <svg className="h-4 w-4 text-gray-300 hover:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
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
