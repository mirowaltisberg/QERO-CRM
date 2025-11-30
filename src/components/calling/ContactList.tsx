"use client";

import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import type { Contact } from "@/lib/types";
import { memo, useCallback, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

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
}

// Memoized list item to prevent re-renders
const ContactListItem = memo(function ContactListItem({
  contact,
  isActive,
  onSelect,
  onFilterByCanton,
  onClearCantonFilter,
  activeCantonFilter,
}: {
  contact: Contact;
  isActive: boolean;
  onSelect: (id: string) => void;
  onFilterByCanton?: (canton: string | null) => void;
  onClearCantonFilter?: () => void;
  activeCantonFilter?: string | null;
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
      className={[
        "w-full rounded-xl border px-3 py-2 text-left transition-colors duration-100",
        isActive
          ? "bg-white border-gray-200 shadow-sm"
          : "border-transparent hover:bg-white/60",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900 truncate">
          {contact.company_name}
        </p>
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
      <p className="mt-1 text-xs text-gray-400">
        {contact.last_call
          ? `Last call ${formatDate(contact.last_call)}`
          : "Never logged"}
      </p>
    </button>
  );
});

const ITEM_HEIGHT = 88; // Approximate height of each contact item

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
}: ContactListProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
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
    <aside className="flex h-full w-80 flex-col border-r border-gray-200 bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
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

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
