"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

interface TeamInfo {
  name: string;
  color: string;
}

interface SearchResultContact {
  id: string;
  type: "contact";
  company_name: string;
  contact_name: string | null;
  email: string | null;
  canton: string | null;
  team_id: string | null;
  team: TeamInfo | null;
}

interface SearchResultTma {
  id: string;
  type: "tma";
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position_title: string | null;
  canton: string | null;
  team_id: string | null;
  team: TeamInfo | null;
}

type SearchResult = SearchResultContact | SearchResultTma;

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<SearchResultContact[]>([]);
  const [tma, setTma] = useState<SearchResultTma[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Combined results for keyboard navigation
  const allResults: SearchResult[] = [
    ...contacts.map((c) => ({ ...c, type: "contact" as const })),
    ...tma.map((t) => ({ ...t, type: "tma" as const })),
  ];

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setContacts([]);
      setTma([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search on query change
  useEffect(() => {
    if (!query || query.length < 2) {
      setContacts([]);
      setTma([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          setContacts(json.data?.contacts || []);
          setTma(json.data?.tma || []);
          setSelectedIndex(0);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[CommandPalette] Search error:", err);
        }
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  // Handle result selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (result.type === "contact") {
        // Navigate to calling page with contact selected
        router.push(`/calling?select=${result.id}`);
      } else {
        // Navigate to TMA page with candidate selected
        router.push(`/tma?select=${result.id}`);
      }
      onClose();
    },
    [router, onClose]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, allResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (allResults[selectedIndex]) {
          handleSelect(allResults[selectedIndex]);
        }
      }
    },
    [allResults, selectedIndex, handleSelect, onClose]
  );

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <SearchIcon className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Suche nach Firma oder TMA..."
            className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 outline-none text-base"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          )}
          <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Mindestens 2 Zeichen eingeben...
            </div>
          ) : allResults.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Keine Ergebnisse für &quot;{query}&quot;
            </div>
          ) : (
            <>
              {/* Contacts section */}
              {contacts.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    Firmen
                  </div>
                  {contacts.map((contact, idx) => {
                    const globalIndex = idx;
                    return (
                      <ResultItem
                        key={contact.id}
                        isSelected={selectedIndex === globalIndex}
                        onClick={() => handleSelect(contact)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                            <BuildingIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 truncate">
                                {contact.company_name}
                              </span>
                              {contact.team && (
                                <TeamTag team={contact.team} />
                              )}
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {contact.contact_name || contact.email || "—"}
                            </div>
                          </div>
                          {contact.canton && (
                            <span className="text-xs text-gray-400">{contact.canton}</span>
                          )}
                        </div>
                      </ResultItem>
                    );
                  })}
                </div>
              )}

              {/* TMA section */}
              {tma.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    TMA Kandidaten
                  </div>
                  {tma.map((candidate, idx) => {
                    const globalIndex = contacts.length + idx;
                    return (
                      <ResultItem
                        key={candidate.id}
                        isSelected={selectedIndex === globalIndex}
                        onClick={() => handleSelect(candidate)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                            <UserIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 truncate">
                                {candidate.first_name} {candidate.last_name}
                              </span>
                              {candidate.team && (
                                <TeamTag team={candidate.team} />
                              )}
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {candidate.position_title || candidate.email || "—"}
                            </div>
                          </div>
                          {candidate.canton && (
                            <span className="text-xs text-gray-400">{candidate.canton}</span>
                          )}
                        </div>
                      </ResultItem>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hint */}
        {allResults.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
            <span>
              <kbd className="rounded border border-gray-200 bg-white px-1">↑</kbd>
              <kbd className="ml-1 rounded border border-gray-200 bg-white px-1">↓</kbd>
              <span className="ml-2">navigieren</span>
            </span>
            <span>
              <kbd className="rounded border border-gray-200 bg-white px-1">Enter</kbd>
              <span className="ml-2">öffnen</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Result item wrapper
function ResultItem({
  children,
  isSelected,
  onClick,
  onMouseEnter,
}: {
  children: React.ReactNode;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "w-full px-4 py-2.5 text-left transition-colors",
        isSelected ? "bg-blue-50" : "hover:bg-gray-50"
      )}
    >
      {children}
    </button>
  );
}

// Team tag component
function TeamTag({ team }: { team: TeamInfo }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: `${team.color}20`,
        color: team.color,
      }}
    >
      {team.name}
    </span>
  );
}

// Icons
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}
