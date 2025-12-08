"use client";

import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import type { Contact, ContactCallLog, Vacancy } from "@/lib/types";
import { memo, useCallback, useRef, useState, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils/cn";

interface ContactListProps {
  contacts: Contact[];
  activeContactId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  onRefresh?: () => void;
  onFilterByCanton?: (canton: string | null) => void;
  onClearCantonFilter?: () => void;
  activeCantonFilter?: string | null;
  availableCantons?: string[];
  callLogs?: Record<string, ContactCallLog>;
  contactVacancies?: Record<string, Vacancy[]>;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isMobile?: boolean;
}

// Memoized list item to prevent re-renders
const ContactListItem = memo(function ContactListItem({
  contact,
  isActive,
  onSelect,
  onFilterByCanton,
  onClearCantonFilter,
  activeCantonFilter,
  callLog,
  hasVacancy,
}: {
  contact: Contact;
  isActive: boolean;
  onSelect: (id: string) => void;
  onFilterByCanton?: (canton: string | null) => void;
  onClearCantonFilter?: () => void;
  activeCantonFilter?: string | null;
  callLog?: ContactCallLog | null;
  hasVacancy?: boolean;
}) {
  const handleClick = useCallback(() => {
    onSelect(contact.id);
  }, [onSelect, contact.id]);

  const handleCantonClick = useCallback(
    (value: string) => {
      if (activeCantonFilter === value) {
        onClearCantonFilter?.();
      } else {
        onFilterByCanton?.(value);
      }
    },
    [activeCantonFilter, onClearCantonFilter, onFilterByCanton]
  );

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full rounded-xl border px-3 py-2 text-left transition-colors duration-100",
        isActive
          ? hasVacancy 
            ? "bg-purple-50 border-purple-200 shadow-sm" 
            : "bg-white border-gray-200 shadow-sm"
          : hasVacancy
            ? "bg-purple-50/60 border-purple-100 hover:bg-purple-50"
            : "border-transparent hover:bg-white/60"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {contact.company_name}
          </p>
          {hasVacancy && (
            <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-100 text-purple-700">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
              </svg>
              Vakanz
            </span>
          )}
        </div>
        <Tag status={contact.status} className="text-[10px] px-2 py-0.5 flex-shrink-0" />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-gray-500 truncate">
          {contact.contact_name ?? "Hiring Team"}
        </p>
        <CantonTag
          canton={contact.canton}
          size="sm"
          onClick={handleCantonClick}
        />
      </div>
      <CallLogDisplay callLog={callLog} />
    </button>
  );
});

// Component to display the call log info
const CallLogDisplay = memo(function CallLogDisplay({
  callLog,
}: {
  callLog?: ContactCallLog | null;
}) {
  if (!callLog) {
    return (
      <p className="mt-1 text-xs text-gray-400">
        Noch kein Call protokolliert
      </p>
    );
  }

  const callerName = callLog.caller?.full_name || "Unbekannt";
  const callerInitials = callerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  
  const avatarUrl = callLog.caller?.avatar_url;
  const relativeTime = formatRelativeTime(callLog.called_at);

  return (
    <div className="mt-1 flex items-center gap-1.5">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={callerName}
          className="h-4 w-4 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[8px] font-medium text-gray-600">
          {callerInitials}
        </span>
      )}
      <p className="text-xs text-gray-500">
        <span className="font-medium">{callerName.split(" ")[0]}</span>
        <span className="text-gray-400"> · {relativeTime}</span>
      </p>
    </div>
  );
});

const ITEM_HEIGHT = 94; // Slightly taller to accommodate call log info

export const ContactList = memo(function ContactList({
  contacts,
  activeContactId,
  onSelect,
  loading,
  onRefresh,
  onFilterByCanton,
  onClearCantonFilter,
  activeCantonFilter,
  availableCantons = [],
  callLogs = {},
  contactVacancies = {},
  searchQuery = "",
  onSearchChange,
  isMobile = false,
}: ContactListProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery ?? "");
  
  // Sync local search with external searchQuery
  useEffect(() => {
    setLocalSearch(searchQuery ?? "");
  }, [searchQuery]);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const handleClearFilter = useCallback(() => {
    onClearCantonFilter?.();
    setIsPickerOpen(false);
  }, [onClearCantonFilter]);

  const handleSelectCanton = useCallback(
    (value: string) => {
      onFilterByCanton?.(value);
      setIsPickerOpen(false);
    },
    [onFilterByCanton]
  );

  return (
    <aside className={`flex h-full flex-col border-r border-gray-200 bg-gray-50 ${isMobile ? "w-full" : "w-80"}`}>
      <header 
        className="flex items-center justify-between border-b border-gray-200 px-4 py-3"
        style={isMobile ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" } : undefined}
      >
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Companies</p>
          <p className="text-sm font-semibold text-gray-900">
            {contacts.length} ready to call
          </p>
          {activeCantonFilter && (
            <button
              className="mt-1 text-xs text-blue-600"
              onClick={handleClearFilter}
            >
              Clear canton ({activeCantonFilter})
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsPickerOpen((prev) => !prev)}
            className="text-xs text-gray-600"
          >
            {activeCantonFilter ? `Canton: ${activeCantonFilter}` : "Filter Canton"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            ↻
          </Button>
        </div>
      </header>
      {/* Search input */}
      <div className="border-b border-gray-200 px-4 py-2">
        <input
          type="text"
          value={localSearch}
          onChange={(e) => {
            setLocalSearch(e.target.value);
            onSearchChange?.(e.target.value);
          }}
          placeholder="Suche nach Firma, Name, E-Mail..."
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      {isPickerOpen && (
        <div className="border-b border-gray-200 px-4 py-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={activeCantonFilter ? "secondary" : "primary"}
              onClick={handleClearFilter}
            >
              All Cantons
            </Button>
            {availableCantons.map((canton) => (
              <CantonTag
                key={canton}
                canton={canton}
                size="sm"
                onClick={handleSelectCanton}
              />
            ))}
          </div>
        </div>
      )}

      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center text-sm text-gray-500">
            <p>No contacts available.</p>
            <p className="text-xs text-gray-400">Add contacts to start calling.</p>
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const contact = contacts[virtualItem.index];
              return (
                <div
                  key={contact.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="px-2 py-0.5"
                >
                  <ContactListItem
                    contact={contact}
                    isActive={contact.id === activeContactId}
                    onSelect={onSelect}
                    onFilterByCanton={onFilterByCanton}
                    onClearCantonFilter={onClearCantonFilter}
                    activeCantonFilter={activeCantonFilter}
                    callLog={callLogs[contact.id]}
                    hasVacancy={!!contactVacancies[contact.id]?.length}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
});

function formatRelativeTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "gerade eben";
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays === 1) return "gestern";
    if (diffDays < 7) return `vor ${diffDays} Tagen`;
    
    // Format as date for older entries
    return date.toLocaleDateString("de-CH", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return isoDate;
  }
}

