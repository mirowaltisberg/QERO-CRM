"use client";

import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import type { Contact } from "@/lib/types";
import { memo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

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
              onClick={() => {
                onClearCantonFilter?.();
                setIsPickerOpen(false);
              }}
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
              onClick={() => {
                onClearCantonFilter?.();
                setIsPickerOpen(false);
              }}
            >
              All Cantons
            </Button>
            {availableCantons.map((canton) => (
              <CantonTag
                key={canton}
                canton={canton}
                size="sm"
                onClick={(value) => {
                  onFilterByCanton?.(value);
                  setIsPickerOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center text-sm text-gray-500">
            <p>No contacts available.</p>
            <p className="text-xs text-gray-400">Add contacts to start calling.</p>
          </div>
        ) : (
          <ul className="space-y-1 p-2">
            <AnimatePresence initial={false}>
              {contacts.map((contact) => {
                const isActive = contact.id === activeContactId;
                return (
                  <motion.li
                    key={contact.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <button
                      onClick={() => onSelect(contact.id)}
                      className={[
                        "w-full rounded-2xl border border-transparent px-3 py-2 text-left transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-white hover:-translate-y-0.5",
                        isActive
                          ? "bg-white shadow-lg border-gray-200"
                          : "text-gray-600",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          {contact.company_name}
                        </p>
                        <Tag status={contact.status} className="text-[10px] px-2 py-0.5" />
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                          {contact.contact_name ?? "Hiring Team"}
                        </p>
                        <CantonTag
                          canton={contact.canton}
                          size="sm"
                          onClick={(value) => {
                            if (activeCantonFilter === value) {
                              onClearCantonFilter?.();
                            } else {
                              onFilterByCanton?.(value);
                            }
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {contact.last_call
                          ? `Last call ${formatDate(contact.last_call)}`
                          : "Never logged"}
                      </p>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
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

