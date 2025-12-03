"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { EmailFoldersRail } from "./EmailFoldersRail";
import { EmailList } from "./EmailList";
import { EmailDetail } from "./EmailDetail";
import { ComposeModal } from "./ComposeModal";
import { Button } from "@/components/ui/button";
import type { EmailThread, EmailFolder, EmailAccount } from "@/lib/types";

interface Props {
  account: Pick<EmailAccount, "id" | "mailbox" | "last_sync_at" | "sync_error"> | null;
}

const PAGE_SIZE = 500;

export function EmailView({ account }: Props) {
  const router = useRouter();
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{ threadId: string; messageId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EmailThread[] | null>(null);
  const [searchSource, setSearchSource] = useState<"db" | "graph" | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Thread lookup map for O(1) access
  const threadMapRef = useRef<Map<string, EmailThread>>(new Map());

  // Fetch threads from database (includes full message content for instant display)
  const fetchThreads = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (!account) return;
    
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({ 
        folder, 
        page: String(pageNum),
        pageSize: String(PAGE_SIZE),
      });

      const response = await fetch(`/api/email/threads?${params}`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to fetch emails");
      }

      const newThreads: EmailThread[] = json.data.threads || [];
      
      // Build/update thread map for O(1) lookup
      const map = threadMapRef.current;
      if (!append) {
        map.clear();
      }
      newThreads.forEach(t => map.set(t.id, t));
      
      if (append) {
        setThreads(prev => [...prev, ...newThreads]);
      } else {
        setThreads(newThreads);
      }
      
      setHasMore(json.data.hasMore);
      setTotal(json.data.total);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch emails");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [account, folder]);

  // Live search via Microsoft Graph
  const performSearch = useCallback(async (query: string) => {
    if (!account || query.length < 2) {
      setSearchResults(null);
      setSearchSource(null);
      return;
    }

    try {
      const params = new URLSearchParams({ q: query, folder });
      const response = await fetch(`/api/email/search?${params}`);
      const json = await response.json();

      if (response.ok && json.data?.results) {
        setSearchResults(json.data.results);
        setSearchSource(json.data.source);
      } else {
        setSearchResults([]);
        setSearchSource("graph");
      }
    } catch {
      setSearchResults(null);
      setSearchSource(null);
    }
  }, [account, folder]);

  // Handle search with debounce
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (!query || query.length < 2) {
      setSearchResults(null);
      setSearchSource(null);
      return;
    }

    const timeout = setTimeout(() => {
      performSearch(query);
    }, 400);
    
    setSearchTimeout(timeout);
  }, [searchTimeout, performSearch]);

  // Load more threads
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchThreads(page + 1, true);
    }
  }, [loadingMore, hasMore, page, fetchThreads]);

  // Initial fetch + folder change
  useEffect(() => {
    setSearchQuery("");
    setSearchResults(null);
    setSearchSource(null);
    setPage(1);
    setSelectedThread(null);
    fetchThreads(1, false);
  }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  // Sync emails
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);

    try {
      const response = await fetch("/api/email/sync", { method: "POST" });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Sync failed");
      }

      await fetchThreads(1, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [fetchThreads]);

  // Select thread - instant from memory, or fetch for search results
  const handleSelectThread = useCallback(async (threadId: string, isLiveResult?: boolean, graphMessageId?: string) => {
    // Check if thread is in local map (synced emails)
    const thread = threadMapRef.current.get(threadId);
    
    if (thread) {
      // Instant display - no API call needed!
      setSelectedThread(thread);
      
      // Mark as read if unread (in background)
      if (!thread.is_read) {
        const updated = { ...thread, is_read: true };
        threadMapRef.current.set(threadId, updated);
        setSelectedThread(updated);
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, is_read: true } : t))
        );
        
        fetch(`/api/email/threads/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_read: true }),
        }).catch(() => {});
      }
      return;
    }
    
    // For live search results, fetch full email from Graph
    if (isLiveResult && graphMessageId) {
      setLoadingDetail(true);
      try {
        const response = await fetch(`/api/email/message/${graphMessageId}`);
        const json = await response.json();
        
        if (response.ok && json.data) {
          // Create a thread-like structure for display
          const liveThread: EmailThread = {
            id: threadId,
            account_id: "",
            graph_conversation_id: json.data.conversationId || threadId,
            subject: json.data.subject || "(No subject)",
            snippet: json.data.bodyPreview || "",
            folder: folder,
            participants: json.data.from?.emailAddress?.address 
              ? [`${json.data.from.emailAddress.name || ""} <${json.data.from.emailAddress.address}>`]
              : [],
            is_read: true,
            is_starred: false,
            has_attachments: json.data.hasAttachments || false,
            last_message_at: json.data.receivedDateTime || json.data.sentDateTime,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            messages: [{
              id: graphMessageId,
              thread_id: threadId,
              graph_message_id: graphMessageId,
              sender_email: json.data.from?.emailAddress?.address || "",
              sender_name: json.data.from?.emailAddress?.name || "",
              recipients: json.data.toRecipients?.map((r: { emailAddress?: { address?: string } }) => r.emailAddress?.address).filter(Boolean) || [],
              cc: json.data.ccRecipients?.map((r: { emailAddress?: { address?: string } }) => r.emailAddress?.address).filter(Boolean) || [],
              subject: json.data.subject || "(No subject)",
              body_preview: json.data.bodyPreview || "",
              body_html: json.data.body?.contentType === "html" ? json.data.body.content : null,
              body_text: json.data.body?.contentType === "text" ? json.data.body.content : null,
              is_read: true,
              has_attachments: json.data.hasAttachments || false,
              sent_at: json.data.sentDateTime,
              received_at: json.data.receivedDateTime,
              created_at: new Date().toISOString(),
            }],
          };
          
          setSelectedThread(liveThread);
          // Add to map for future clicks
          threadMapRef.current.set(threadId, liveThread);
        }
      } catch (err) {
        console.error("Failed to fetch live email:", err);
        setError("Failed to load email");
      } finally {
        setLoadingDetail(false);
      }
    }
  }, [folder]);

  // Handle reply
  const handleReply = useCallback((threadId: string, messageId: string) => {
    setReplyTo({ threadId, messageId });
    setComposeOpen(true);
  }, []);

  // Handle archive/delete
  const handleMoveThread = useCallback(async (threadId: string, targetFolder: EmailFolder) => {
    try {
      await fetch(`/api/email/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: targetFolder }),
      });

      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      threadMapRef.current.delete(threadId);
      if (selectedThread?.id === threadId) {
        setSelectedThread(null);
      }
    } catch (err) {
      console.error("Failed to move thread:", err);
    }
  }, [selectedThread]);

  // Handle star/unstar
  const handleToggleStar = useCallback(async (threadId: string, isStarred: boolean) => {
    // Update UI immediately
    const thread = threadMapRef.current.get(threadId);
    if (thread) {
      const updated = { ...thread, is_starred: isStarred };
      threadMapRef.current.set(threadId, updated);
    }
    
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, is_starred: isStarred } : t))
    );
    
    if (selectedThread?.id === threadId) {
      setSelectedThread((prev) => prev ? { ...prev, is_starred: isStarred } : null);
    }

    // Sync to server in background
    try {
      await fetch(`/api/email/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_starred: isStarred }),
      });
    } catch (err) {
      console.error("Failed to toggle star:", err);
    }
  }, [selectedThread]);

  // No account connected
  if (!account) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
          <EmailIcon className="h-8 w-8 text-gray-400" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Connect your email</h2>
          <p className="mt-1 text-sm text-gray-500">
            Connect your Outlook account to send and receive emails directly from QERO.
          </p>
        </div>
        <Button onClick={() => router.push("/settings")}>
          Go to Settings
        </Button>
      </div>
    );
  }

  // Determine which threads to display
  const displayThreads = searchResults !== null ? searchResults : threads;

  return (
    <div className="flex h-full">
      <EmailFoldersRail
        activeFolder={folder}
        onFolderChange={setFolder}
        onCompose={() => {
          setReplyTo(null);
          setComposeOpen(true);
        }}
      />

      <EmailList
        threads={displayThreads}
        selectedId={selectedThread?.id || null}
        loading={loading}
        loadingMore={loadingMore}
        syncing={syncing}
        error={error}
        searchQuery={searchQuery}
        searchSource={searchSource}
        onSearchChange={handleSearchChange}
        onSelect={handleSelectThread}
        onSync={handleSync}
        onToggleStar={handleToggleStar}
        onLoadMore={handleLoadMore}
        hasMore={hasMore && searchResults === null}
        total={searchResults !== null ? displayThreads.length : total}
        folder={folder}
        mailbox={account.mailbox}
        lastSyncAt={account.last_sync_at}
      />

      <EmailDetail
        thread={selectedThread}
        loading={loadingDetail}
        onReply={handleReply}
        onArchive={(id) => handleMoveThread(id, "archive")}
        onDelete={(id) => handleMoveThread(id, "trash")}
        onToggleStar={handleToggleStar}
      />

      <ComposeModal
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setReplyTo(null);
        }}
        replyTo={replyTo}
        onSent={() => {
          setComposeOpen(false);
          setReplyTo(null);
          handleSync();
        }}
      />
    </div>
  );
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}
