"use client";

import { memo, useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { ContactNote, TmaNote } from "@/lib/types";

type NoteType = ContactNote | TmaNote;

interface NotesPanelProps {
  entityId: string | null;
  entityType: "contact" | "tma";
  legacyNotes?: string | null; // Old single-field notes (for backward compat)
  onSaveLegacyNotes?: (value: string | null) => Promise<void>;
  onNoteAdded?: () => void;
  currentUserId?: string;
}

export const NotesPanel = memo(function NotesPanel({
  entityId,
  entityType,
  legacyNotes,
  onSaveLegacyNotes,
  onNoteAdded,
  currentUserId,
}: NotesPanelProps) {
  const [notes, setNotes] = useState<NoteType[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const apiPath = entityType === "contact" 
    ? `/api/contacts/${entityId}/notes`
    : `/api/tma/${entityId}/notes`;

  const tableName = entityType === "contact" ? "contact_notes" : "tma_notes";
  const filterColumn = entityType === "contact" ? "contact_id" : "tma_id";

  // Fetch notes when entity changes
  useEffect(() => {
    if (!entityId) {
      setNotes([]);
      return;
    }

    setLoading(true);
    fetch(apiPath)
      .then((res) => res.json())
      .then((data) => {
        if (data.data) {
          setNotes(data.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entityId, apiPath]);

  // Real-time subscription for notes
  useEffect(() => {
    if (!entityId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`notes-${entityType}-${entityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: tableName,
          filter: `${filterColumn}=eq.${entityId}`,
        },
        async (payload) => {
          console.log(`[Notes Realtime] ${entityType} change:`, payload.eventType);

          if (payload.eventType === "INSERT") {
            // Fetch the full note with author info
            try {
              const res = await fetch(apiPath);
              if (res.ok) {
                const json = await res.json();
                if (json.data) {
                  setNotes(json.data);
                }
              }
            } catch {
              // Fallback: add without author info
              setNotes((prev) => [payload.new as NoteType, ...prev]);
            }
          } else if (payload.eventType === "UPDATE") {
            // Fetch updated notes
            try {
              const res = await fetch(apiPath);
              if (res.ok) {
                const json = await res.json();
                if (json.data) {
                  setNotes(json.data);
                }
              }
            } catch {
              setNotes((prev) =>
                prev.map((n) => (n.id === payload.new.id ? { ...n, ...payload.new } as NoteType : n))
              );
            }
          } else if (payload.eventType === "DELETE") {
            setNotes((prev) => prev.filter((n) => n.id !== payload.old.id));
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Notes Realtime] ${entityType} subscription status:`, status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entityId, entityType, tableName, filterColumn, apiPath]);

  const handleSubmit = useCallback(async () => {
    if (!entityId || !newNote.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Failed to add note:", data.error);
        alert(`Failed to add note: ${data.error}`);
        return;
      }
      if (data.data) {
        setNotes((prev) => [data.data, ...prev]);
        setNewNote("");
        onNoteAdded?.();
      }
    } catch (error) {
      console.error("Failed to add note:", error);
      alert("Failed to add note. Check console for details.");
    } finally {
      setSubmitting(false);
    }
  }, [entityId, newNote, apiPath, onNoteAdded]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  if (!entityId) {
    return null;
  }

  return (
    <Panel title="Notes" description="Team notes with attribution" className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* New note input */}
      <div className="mb-4 flex-shrink-0">
        <Textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note... (Cmd+Enter to submit)"
          className="min-h-[80px]"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newNote.trim() || submitting}
          >
            {submitting ? "Adding..." : "Add Note"}
          </Button>
        </div>
      </div>

      {/* Notes list - scrollable */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {loading ? (
          <p className="text-sm text-gray-400">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet. Add the first one!</p>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              canEdit={currentUserId ? note.author_id === currentUserId : false}
              onNoteUpdated={(updated) =>
                setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
              }
              entityType={entityType}
              entityId={entityId}
            />
          ))
        )}

        {/* Legacy notes (if any exist and no new notes) */}
        {legacyNotes && notes.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
            <p className="text-xs text-gray-400 mb-2">Legacy notes (pre-team system)</p>
            <Textarea
              value={legacyNotes}
              onChange={(e) => onSaveLegacyNotes?.(e.target.value || null)}
              onAutoSave={onSaveLegacyNotes}
              autosaveDelay={800}
              placeholder="Old notes..."
              className="min-h-[100px]"
            />
          </div>
        )}
      </div>
    </Panel>
  );
});

const NoteCard = memo(function NoteCard({
  note,
  entityType,
  entityId,
  canEdit,
  onNoteUpdated,
}: {
  note: NoteType;
  entityType: "contact" | "tma";
  entityId: string;
  canEdit: boolean;
  onNoteUpdated: (note: NoteType) => void;
}) {
  const author = note.author;
  const initials = author?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const apiPath =
    entityType === "contact"
      ? `/api/contacts/${entityId}/notes/${note.id}`
      : `/api/tma/${entityId}/notes/${note.id}`;

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === note.content) {
      setEditing(false);
      setEditValue(note.content);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to update note");
      onNoteUpdated(json.data);
      setEditing(false);
    } catch (error) {
      console.error("Failed to update note:", error);
      alert("Failed to update note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
          {author?.avatar_url ? (
            <Image
              src={author.avatar_url}
              alt={author.full_name || "User"}
              width={32}
              height={32}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-500">
              {initials}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-900">
              {author?.full_name || "Unknown"}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-400 text-xs">
              {formatRelativeTime(note.created_at)}
              {note.updated_at && note.updated_at !== note.created_at && (
                <span className="text-[10px] text-gray-400 ml-2">
                  (edited {formatRelativeTime(note.updated_at)})
                </span>
              )}
            </span>
            {canEdit && (
              <div className="relative ml-auto">
                <button
                  className="rounded-full border border-gray-200 p-1 text-gray-500 hover:text-gray-900"
                  onClick={() => setShowMenu((prev) => !prev)}
                >
                  ⋮
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-1 rounded-md border border-gray-200 bg-white shadow-lg text-xs">
                    <button
                      className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                      onClick={() => {
                        setEditing(true);
                        setShowMenu(false);
                      }}
                    >
                      Edit note
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {editing ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                className="min-h-[80px]"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
          )}
        </div>
      </div>
    </div>
  );
});

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
