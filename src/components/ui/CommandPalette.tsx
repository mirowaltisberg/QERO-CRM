"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { looksLikeSwissLocation } from "@/lib/geo/client";
import { useTmaCacheOptional } from "@/lib/cache/TmaCacheContext";

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
  status_tags: string[] | null;
  activity: string | null;
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

interface SearchResultChatRoom {
  id: string;
  type: "chat_room";
  room_id: string;
  room_type: "dm";
  user_name: string;
  user_avatar: string | null;
}

type SearchResult = SearchResultContact | SearchResultTma | SearchResultEmail | SearchResultChat | SearchResultChatRoom;

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterType = "all" | "contacts" | "tma" | "emails" | "chat";
type TmaQualityFilter = "all" | "A" | "B" | "C";
type TmaActivityFilter = "all" | "active" | "not_active";

// Quick navigation items
const NAV_ITEMS = [
  { id: "nav-calling", name: "Calling", href: "/calling", icon: "📞", aliases: ["cal", "call", "anrufen", "phone"] },
  { id: "nav-companies", name: "Companies", href: "/contacts", icon: "🏢", aliases: ["comp", "firmen", "firma", "kontakte", "contacts"] },
  { id: "nav-tma", name: "TMA", href: "/tma", icon: "👥", aliases: ["kandidaten", "candidates"] },
  { id: "nav-email", name: "Email", href: "/email", icon: "✉️", aliases: ["mail", "emails", "nachrichten"] },
  { id: "nav-chat", name: "Chat", href: "/chat", icon: "💬", aliases: ["messages", "dm", "direct"] },
  { id: "nav-dashboard", name: "Dashboard", href: "/dashboard", icon: "📊", aliases: ["dash", "stats", "übersicht"] },
  { id: "nav-settings", name: "Settings", href: "/settings", icon: "⚙️", aliases: ["einstellungen", "config", "profil", "profile"] },
];

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<SearchResultContact[]>([]);
  const [tma, setTma] = useState<SearchResultTma[]>([]);
  const [emails, setEmails] = useState<SearchResultEmail[]>([]);
  const [chat, setChat] = useState<SearchResultChat[]>([]);
  const [chatRooms, setChatRooms] = useState<SearchResultChatRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Get cached TMA data for instant search
  const tmaCache = useTmaCacheOptional();
  
  const [isLocationMode, setIsLocationMode] = useState(false);
  const [radius, setRadius] = useState(25);
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [tmaQualityFilter, setTmaQualityFilter] = useState<TmaQualityFilter>("all");
  const [tmaActivityFilter, setTmaActivityFilter] = useState<TmaActivityFilter>("all");

  // Instant TMA search from cache (no API call needed)
  const cachedTmaResults = useMemo(() => {
    if (!tmaCache?.candidates.length || query.length < 2 || isLocationMode) {
      return [];
    }
    
    const q = query.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    
    return tmaCache.candidates
      .filter((c) => {
        const fullName = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
        const email = (c.email || "").toLowerCase();
        const position = (c.position_title || "").toLowerCase();
        
        // Multi-word search: all words must match somewhere
        if (words.length > 1) {
          return words.every((word) =>
            fullName.includes(word) ||
            email.includes(word) ||
            position.includes(word)
          );
        }
        
        // Single word search
        return (
          fullName.includes(q) ||
          email.includes(q) ||
          position.includes(q)
        );
      })
      .slice(0, 20) // Limit results
      .map((c): SearchResultTma => ({
        id: c.id,
        type: "tma",
        first_name: c.first_name || "",
        last_name: c.last_name || "",
        email: c.email,
        phone: c.phone,
        position_title: c.position_title,
        canton: c.canton,
        team_id: c.team_id,
        team: null, // Cache doesn't have team info
        status_tags: c.status_tags,
        activity: c.activity,
      }));
  }, [tmaCache?.candidates, query, isLocationMode]);

  // Filter navigation items based on query
  const filteredNavItems = query.length >= 1 
    ? NAV_ITEMS.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.aliases.some((alias) => alias.includes(q))
        );
      })
    : [];

  // Filter results based on selected filter
  const filteredContacts = filter === "all" || filter === "contacts" ? contacts : [];
  
  // Merge cached TMA with API TMA (API results take precedence for team info)
  const mergedTma = useMemo(() => {
    // If we have API results, use those (they have team info)
    if (tma.length > 0) return tma;
    // Otherwise use cached results for instant display
    return cachedTmaResults;
  }, [tma, cachedTmaResults]);

  // Apply TMA sub-filters (quality and activity)
  const filteredTma = (filter === "all" || filter === "tma" ? mergedTma : []).filter((t) => {
    // Quality filter
    if (tmaQualityFilter !== "all") {
      const tags = t.status_tags || [];
      if (!tags.includes(tmaQualityFilter)) return false;
    }
    // Activity filter
    if (tmaActivityFilter !== "all") {
      if (tmaActivityFilter === "active" && t.activity !== "active") return false;
      if (tmaActivityFilter === "not_active" && t.activity !== "not_active") return false;
    }
    return true;
  });
  
  const filteredEmails = filter === "all" || filter === "emails" ? emails : [];
  const filteredChatRooms = filter === "all" || filter === "chat" ? chatRooms : [];
  const filteredChat = filter === "all" || filter === "chat" ? chat : [];

  // Combined results for keyboard navigation (nav items first, then chat rooms before chat messages)
  const allResultsCount = filteredNavItems.length + filteredContacts.length + filteredTma.length + filteredEmails.length + filteredChatRooms.length + filteredChat.length;
  
  const allResults: SearchResult[] = [
    ...filteredContacts.map((c) => ({ ...c, type: "contact" as const })),
    ...filteredTma.map((t) => ({ ...t, type: "tma" as const })),
    ...filteredEmails.map((e) => ({ ...e, type: "email" as const })),
    ...filteredChatRooms.map((r) => ({ ...r, type: "chat_room" as const })),
    ...filteredChat.map((c) => ({ ...c, type: "chat" as const })),
  ];
  
  // Total selectable items (nav items + search results)
  const totalSelectableItems = filteredNavItems.length + allResults.length;

  // Count results per type (for filter badges)
  const counts = {
    contacts: contacts.length,
    tma: mergedTma.length,
    emails: emails.length,
    chat: chatRooms.length + chat.length,
  };
  const totalCount = counts.contacts + counts.tma + counts.emails + counts.chat;

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setContacts([]);
      setTma([]);
      setEmails([]);
      setChat([]);
      setChatRooms([]);
      setSelectedIndex(0);
      setIsLocationMode(false);
      setLocation(null);
      setFilter("all");
      setTmaQualityFilter("all");
      setTmaActivityFilter("all");
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
      setChatRooms([]);
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
          setChatRooms(json.data?.chat_rooms || []);
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

  // Handle navigation item selection
  const handleNavSelect = useCallback(
    (item: typeof NAV_ITEMS[0]) => {
      router.push(item.href);
      onClose();
    },
    [router, onClose]
  );

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
      } else if (result.type === "chat_room") {
        router.push(`/chat?room=${result.room_id}`);
      }
      onClose();
    },
    [router, onClose]
  );

  // Keyboard navigation (nav items first, then search results)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, totalSelectableItems - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Check if a nav item is selected
        if (selectedIndex < filteredNavItems.length) {
          handleNavSelect(filteredNavItems[selectedIndex]);
        } else {
          // Adjust index for search results
          const resultIndex = selectedIndex - filteredNavItems.length;
          if (allResults[resultIndex]) {
            handleSelect(allResults[resultIndex]);
          }
        }
      }
    },
    [allResults, filteredNavItems, selectedIndex, handleSelect, handleNavSelect, onClose, totalSelectableItems]
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

  // Calculate global indices for each section (nav items first, then filtered arrays)
  const navItemsCount = filteredNavItems.length;
  const contactStartIndex = navItemsCount;
  const tmaStartIndex = contactStartIndex + filteredContacts.length;
  const emailStartIndex = tmaStartIndex + filteredTma.length;
  const chatRoomStartIndex = emailStartIndex + filteredEmails.length;
  const chatStartIndex = chatRoomStartIndex + filteredChatRooms.length;

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

        {/* Filter buttons - shown in both text and location search */}
        {query.length >= 2 && totalCount > 0 && (
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2 overflow-x-auto">
            <FilterButton
              active={filter === "all"}
              onClick={() => { setFilter("all"); setSelectedIndex(0); }}
              color="gray"
            >
              Alle ({totalCount})
            </FilterButton>
            {counts.contacts > 0 && (
              <FilterButton
                active={filter === "contacts"}
                onClick={() => { setFilter("contacts"); setSelectedIndex(0); }}
                color="blue"
              >
                Firmen ({counts.contacts})
              </FilterButton>
            )}
            {counts.tma > 0 && (
              <FilterButton
                active={filter === "tma"}
                onClick={() => { setFilter("tma"); setSelectedIndex(0); }}
                color="purple"
              >
                TMA ({counts.tma})
              </FilterButton>
            )}
            {/* Email and Chat only in text search mode */}
            {!isLocationMode && counts.emails > 0 && (
              <FilterButton
                active={filter === "emails"}
                onClick={() => { setFilter("emails"); setSelectedIndex(0); }}
                color="green"
              >
                E-Mails ({counts.emails})
              </FilterButton>
            )}
            {!isLocationMode && counts.chat > 0 && (
              <FilterButton
                active={filter === "chat"}
                onClick={() => { setFilter("chat"); setSelectedIndex(0); }}
                color="orange"
              >
                Chat ({counts.chat})
              </FilterButton>
            )}
          </div>
        )}

        {/* TMA Sub-filters (Quality A/B/C and Activity) - shown in both text and location search */}
        {query.length >= 2 && counts.tma > 0 && (filter === "tma" || filter === "all" || isLocationMode) && (
          <div className="flex items-center gap-4 border-b border-gray-200 px-4 py-2 bg-purple-50/50">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 mr-1">Qualität:</span>
              <TmaSubFilterButton
                active={tmaQualityFilter === "all"}
                onClick={() => { setTmaQualityFilter("all"); setSelectedIndex(0); }}
              >
                Alle
              </TmaSubFilterButton>
              <TmaSubFilterButton
                active={tmaQualityFilter === "A"}
                onClick={() => { setTmaQualityFilter("A"); setSelectedIndex(0); }}
                color="green"
              >
                A
              </TmaSubFilterButton>
              <TmaSubFilterButton
                active={tmaQualityFilter === "B"}
                onClick={() => { setTmaQualityFilter("B"); setSelectedIndex(0); }}
                color="yellow"
              >
                B
              </TmaSubFilterButton>
              <TmaSubFilterButton
                active={tmaQualityFilter === "C"}
                onClick={() => { setTmaQualityFilter("C"); setSelectedIndex(0); }}
                color="red"
              >
                C
              </TmaSubFilterButton>
            </div>
            <div className="w-px h-4 bg-gray-300" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 mr-1">Aktivität:</span>
              <TmaSubFilterButton
                active={tmaActivityFilter === "all"}
                onClick={() => { setTmaActivityFilter("all"); setSelectedIndex(0); }}
              >
                Alle
              </TmaSubFilterButton>
              <TmaSubFilterButton
                active={tmaActivityFilter === "active"}
                onClick={() => { setTmaActivityFilter("active"); setSelectedIndex(0); }}
                color="green"
              >
                Active
              </TmaSubFilterButton>
              <TmaSubFilterButton
                active={tmaActivityFilter === "not_active"}
                onClick={() => { setTmaActivityFilter("not_active"); setSelectedIndex(0); }}
                color="gray"
              >
                Not Active
              </TmaSubFilterButton>
            </div>
          </div>
        )}

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
          {/* Navigation shortcuts - always show when matching, even with short query */}
          {filteredNavItems.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                Navigation
              </div>
              {filteredNavItems.map((item, idx) => (
                <ResultItem
                  key={item.id}
                  isSelected={selectedIndex === idx}
                  onClick={() => handleNavSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-xl">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900">{item.name}</span>
                    </div>
                    <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">
                      Enter
                    </kbd>
                  </div>
                </ResultItem>
              ))}
            </div>
          )}

          {query.length < 2 && filteredNavItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              <p>Tippe zum Navigieren oder suchen...</p>
              <p className="mt-2 text-xs text-gray-400">
                z.B. &quot;cal&quot; für Calling, &quot;tma&quot; für TMA
              </p>
            </div>
          ) : query.length >= 2 && allResults.length === 0 && filteredNavItems.length === 0 && !loading ? (
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
              {filteredContacts.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    {isLocationMode ? "Firmen in der Nähe" : "Firmen"}
                  </div>
                  {filteredContacts.map((contact, idx) => {
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
              {filteredTma.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    {isLocationMode ? "TMA Kandidaten in der Nähe" : "TMA Kandidaten"}
                  </div>
                  {filteredTma.map((candidate, idx) => {
                    const globalIndex = tmaStartIndex + idx;
                    const statusTags = candidate.status_tags || [];
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-gray-900">
                                {candidate.first_name} {candidate.last_name}
                              </span>
                              {/* Quality badges */}
                              {statusTags.map((tag) => (
                                <QualityBadge key={tag} quality={tag} />
                              ))}
                              {/* Activity badge */}
                              <ActivityBadge activity={candidate.activity} />
                              {/* Team tag */}
                              {candidate.team && <TeamTag team={candidate.team} />}
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                              {candidate.position_title || candidate.email || "—"}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-xs shrink-0">
                            {candidate.distance_km !== undefined && (
                              <span className="font-semibold text-blue-600">
                                {candidate.distance_km} km
                              </span>
                            )}
                            {candidate.canton && (
                              <span className="text-gray-400">{candidate.canton}</span>
                            )}
                          </div>
                        </div>
                      </ResultItem>
                    );
                  })}
                </div>
              )}

              {/* Emails section */}
              {filteredEmails.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    E-Mails
                  </div>
                  {filteredEmails.map((email, idx) => {
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

              {/* Chat Rooms section (DMs matching user name) */}
              {filteredChatRooms.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    Chats
                  </div>
                  {filteredChatRooms.map((room, idx) => {
                    const globalIndex = chatRoomStartIndex + idx;
                    return (
                      <ResultItem
                        key={room.id}
                        isSelected={selectedIndex === globalIndex}
                        onClick={() => handleSelect(room)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="flex items-center gap-3">
                          {room.user_avatar ? (
                            <img
                              src={room.user_avatar}
                              alt={room.user_name}
                              className="h-9 w-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-orange-600 font-medium text-sm">
                              {room.user_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">
                              {room.user_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              Direktnachricht
                            </div>
                          </div>
                        </div>
                      </ResultItem>
                    );
                  })}
                </div>
              )}

              {/* Chat Messages section */}
              {filteredChat.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 bg-gray-50">
                    Chat Nachrichten
                  </div>
                  {filteredChat.map((message, idx) => {
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

// Filter button component
function FilterButton({
  children,
  active,
  onClick,
  color,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color: "gray" | "blue" | "purple" | "green" | "orange";
}) {
  const colors = {
    gray: {
      active: "bg-gray-900 text-white",
      inactive: "bg-gray-100 text-gray-600 hover:bg-gray-200",
    },
    blue: {
      active: "bg-blue-500 text-white",
      inactive: "bg-blue-50 text-blue-600 hover:bg-blue-100",
    },
    purple: {
      active: "bg-purple-500 text-white",
      inactive: "bg-purple-50 text-purple-600 hover:bg-purple-100",
    },
    green: {
      active: "bg-green-500 text-white",
      inactive: "bg-green-50 text-green-600 hover:bg-green-100",
    },
    orange: {
      active: "bg-orange-500 text-white",
      inactive: "bg-orange-50 text-orange-600 hover:bg-orange-100",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
        active ? colors[color].active : colors[color].inactive
      )}
    >
      {children}
    </button>
  );
}

// TMA sub-filter button component (smaller, more subtle)
function TmaSubFilterButton({
  children,
  active,
  onClick,
  color = "gray",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: "gray" | "green" | "yellow" | "red";
}) {
  const colors = {
    gray: {
      active: "bg-gray-700 text-white",
      inactive: "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200",
    },
    green: {
      active: "bg-green-500 text-white",
      inactive: "bg-white text-green-600 hover:bg-green-50 border border-green-200",
    },
    yellow: {
      active: "bg-yellow-500 text-white",
      inactive: "bg-white text-yellow-600 hover:bg-yellow-50 border border-yellow-200",
    },
    red: {
      active: "bg-red-500 text-white",
      inactive: "bg-white text-red-600 hover:bg-red-50 border border-red-200",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap",
        active ? colors[color].active : colors[color].inactive
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

// Quality badge component (A/B/C)
function QualityBadge({ quality }: { quality: string }) {
  const colors: Record<string, string> = {
    A: "bg-green-100 text-green-700 border-green-300",
    B: "bg-yellow-100 text-yellow-700 border-yellow-300",
    C: "bg-red-100 text-red-700 border-red-300",
  };
  
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border",
      colors[quality] || "bg-gray-100 text-gray-600 border-gray-300"
    )}>
      {quality}
    </span>
  );
}

// Activity badge component
function ActivityBadge({ activity }: { activity: string | null }) {
  if (!activity) return null;
  
  const isActive = activity === "active";
  
  return (
    <span className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium border",
      isActive 
        ? "bg-green-50 text-green-600 border-green-300" 
        : "bg-gray-50 text-gray-500 border-gray-300"
    )}>
      {isActive ? "Active" : "Not Active"}
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
