"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { looksLikeSwissLocation } from "@/lib/geo/client";

interface TeamInfo {
  name: string;
  color: string;
}

interface LocationInfo {
  name: string;
  plz: string;
  lat: number;
  lng: number;
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
  distance_km?: number;
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
  distance_km?: number;
}

interface SearchResultEmail {
  id: string;
  type: "email";
  thread_id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string;
  body_preview: string | null;
  sent_at: string | null;
}

interface SearchResultChat {
  id: string;
  type: "chat";
  room_id: string;
  room_name: string | null;
  room_type: "all" | "team" | "dm";
  content: string;
  sender_name: string | null;
  created_at: string;
}

type SearchResult = SearchResultContact | SearchResultTma | SearchResultEmail | SearchResultChat;

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
  const [emails, setEmails] = useState<SearchResultEmail[]>([]);
  const [chat, setChat] = useState<SearchResultChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLocationMode, setIsLocationMode] = useState(false);
  const [radius, setRadius] = useState(25);
  const [location, setLocation] = useState<LocationInfo | null>(null);

  // Combined results for keyboard navigation
  const allResults: SearchResult[] = [
    ...contacts.map((c) => ({ ...c, type: "contact" as const })),
    ...tma.map((t) => ({ ...t, type: "tma" as const })),
    ...emails.map((e) => ({ ...e, type: "email" as const })),
    ...chat.map((c) => ({ ...c, type: "chat" as const })),
  ];

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setContacts([]);
      setTma([]);
      setEmails([]);
      setChat([]);
      setSelectedIndex(0);
      setIsLocationMode(false);
      setLocation(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Detect if query looks like a location
  useEffect(() => {
    if (query.length >= 2) {
      const looksLikeLocation = looksLikeSwissLocation(query);
      setIsLocationMode(looksLikeLocation);
    } else {
      setIsLocationMode(false);
    }
  }, [query]);

  // Search on query change or radius change
  useEffect(() => {
    if (!query || query.length < 2) {
      setContacts([]);
      setTma([]);
      setEmails([]);
      setChat([]);
      setLocation(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        let url: string;
        if (isLocationMode) {
          url = `/api/search?location=${encodeURIComponent(query)}&radius=${radius}`;
        } else {
          url = `/api/search?q=${encodeURIComponent(query)}`;
        }

        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          setContacts(json.data?.contacts || []);
          setTma(json.data?.tma || []);
          setEmails(json.data?.emails || []);
          setChat(json.data?.chat || []);
          setLocation(json.data?.location || null);
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
  }, [query, isLocationMode, radius]);

  // Handle result selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (result.type === "contact") {
        router.push(`/calling?select=${result.id}`);
      } else if (result.type === "tma") {
        router.push(`/tma?select=${result.id}`);
      } else if (result.type === "email") {
        router.push(`/email?thread=${result.thread_id}`);
      } else if (result.type === "chat") {
        router.push(`/chat?room=${result.room_id}`);
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

  // Calculate global indices for each section
  const contactStartIndex = 0;
  const tmaStartIndex = contacts.length;
  const emailStartIndex = tmaStartIndex + tma.length;
  const chatStartIndex = emailStartIndex + emails.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          {isLocationMode ? (
            <LocationIcon className="h-5 w-5 text-blue-500" />
          ) : (
            <SearchIcon className="h-5 w-5 text-gray-400" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Suche Firmen, TMA, E-Mails, Chat..."
            className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 outline-none text-base"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          )}
          <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500">
            ESC
          </kbd>
        </div>

        {/* Location mode indicator + radius slider */}
        {isLocationMode && query.length >= 2 && (
          <div className="flex items-center gap-4 border-b border-gray-200 bg-blue-50 px-4 py-2">
            <span className="text-xs font-medium text-blue-700">
              📍 Standortsuche
              {location && `: ${location.name} (${location.plz})`}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-blue-600">{radius} km</span>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value))}
                className="w-24 h-1 accent-blue-500"
              />
            </div>
          </div>
        )}

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              <p>Mindestens 2 Zeichen eingeben...</p>
              <p className="mt-2 text-xs text-gray-400">
                Suche nach Firmen, TMA, E-Mails oder Chat-Nachrichten
              </p>
            </div>
          ) : allResults.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              {isLocationMode ? (
                <>
                  <p>Keine Ergebnisse im Umkreis von {radius} km</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Versuche einen grösseren Radius
                  </p>
                </>
              ) : (
                <p>Keine Ergebnisse für &quot;{query}&quot;</p>
              )}
            </div>
          ) : (
            <>
              {/* Contacts section */}
              {contacts.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    {isLocationMode ? "Firmen in der Nähe" : "Firmen"}
                  </div>
                  {contacts.map((contact, idx) => {
                    const globalIndex = contactStartIndex + idx;
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
                              {contact.team && <TeamTag team={contact.team} />}
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {contact.contact_name || contact.email || "—"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {contact.distance_km !== undefined && (
                              <span className="font-medium text-blue-600">
                                {contact.distance_km} km
                              </span>
                            )}
                            {contact.canton && !contact.distance_km && (
                              <span>{contact.canton}</span>
                            )}
                          </div>
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
                    {isLocationMode ? "TMA Kandidaten in der Nähe" : "TMA Kandidaten"}
                  </div>
                  {tma.map((candidate, idx) => {
                    const globalIndex = tmaStartIndex + idx;
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
                              {candidate.team && <TeamTag team={candidate.team} />}
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {candidate.position_title || candidate.email || "—"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {candidate.distance_km !== undefined && (
                              <span className="font-medium text-blue-600">
                                {candidate.distance_km} km
                              </span>
                            )}
                            {candidate.canton && !candidate.distance_km && (
                              <span>{candidate.canton}</span>
                            )}
                          </div>
                        </div>
                      </ResultItem>
                    );
                  })}
                </div>
              )}

              {/* Emails section */}
              {emails.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    E-Mails
                  </div>
                  {emails.map((email, idx) => {
                    const globalIndex = emailStartIndex + idx;
                    return (
                      <ResultItem
                        key={email.id}
                        isSelected={selectedIndex === globalIndex}
                        onClick={() => handleSelect(email)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-600">
                            <EmailIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {email.subject || "(Kein Betreff)"}
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {email.sender_name || email.sender_email}
                              {email.body_preview && ` — ${email.body_preview}`}
                            </div>
                          </div>
                          {email.sent_at && (
                            <div className="text-xs text-gray-400 whitespace-nowrap">
                              {formatDate(email.sent_at)}
                            </div>
                          )}
                        </div>
                      </ResultItem>
                    );
                  })}
                </div>
              )}

              {/* Chat section */}
              {chat.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    Chat
                  </div>
                  {chat.map((message, idx) => {
                    const globalIndex = chatStartIndex + idx;
                    return (
                      <ResultItem
                        key={message.id}
                        isSelected={selectedIndex === globalIndex}
                        onClick={() => handleSelect(message)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                            <ChatIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 truncate">
                                {message.sender_name || "Unbekannt"}
                              </span>
                              <RoomTag roomType={message.room_type} roomName={message.room_name} />
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {message.content}
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 whitespace-nowrap">
                            {formatDate(message.created_at)}
                          </div>
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

// Room tag component
function RoomTag({ roomType, roomName }: { roomType: string; roomName: string | null }) {
  const colors: Record<string, { bg: string; text: string }> = {
    all: { bg: "bg-gray-100", text: "text-gray-600" },
    team: { bg: "bg-blue-100", text: "text-blue-600" },
    dm: { bg: "bg-purple-100", text: "text-purple-600" },
  };
  const style = colors[roomType] || colors.dm;
  const label = roomType === "dm" ? "DM" : roomName || roomType;

  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", style.bg, style.text)}>
      {label}
    </span>
  );
}

// Format date helper
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Gestern";
  } else if (diffDays < 7) {
    return date.toLocaleDateString("de-CH", { weekday: "short" });
  } else {
    return date.toLocaleDateString("de-CH", { day: "numeric", month: "short" });
  }
}

// Icons
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
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

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}
