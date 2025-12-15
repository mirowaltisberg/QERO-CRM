"use client";

import { Fragment, memo, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Contact } from "@/lib/types";
import type { ContactStatus } from "@/lib/utils/constants";
import { CONTACT_STATUS_LABELS } from "@/lib/utils/constants";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { useContactsTable } from "@/lib/hooks/useContactsTable";
import { TableToolbar } from "./TableToolbar";
import { CantonTag } from "@/components/ui/CantonTag";
import { cn } from "@/lib/utils/cn";
import { ContactsImporter } from "./ContactsImporter";

interface ContactsTableProps {
  initialContacts: Contact[];
}

const ROW_HEIGHT = 64; // Approximate height of each table row

// Memoized table row to prevent re-renders
const ContactTableRow = memo(function ContactTableRow({
  contact,
  isSelected,
  onToggleSelection,
  onFilterByCanton,
}: {
  contact: Contact;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  onFilterByCanton: (canton: string) => void;
}) {
  const handleCheckboxChange = useCallback(() => {
    onToggleSelection(contact.id);
  }, [onToggleSelection, contact.id]);

  const handleCantonClick = useCallback(
    (value: string) => {
      onFilterByCanton(value);
    },
    [onFilterByCanton]
  );

  return (
    <tr className={cn(isSelected ? "bg-gray-50" : "", "hover:bg-gray-50/50")}>
      <td className="px-4 py-3 w-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
        />
      </td>
      <td className="px-4 py-3 font-medium text-gray-900">{contact.company_name}</td>
      <td className="px-4 py-3">{contact.contact_name ?? "Hiring Team"}</td>
      <td className="px-4 py-3">
        <CantonTag canton={contact.canton} onClick={handleCantonClick} />
      </td>
      <td className="px-4 py-3">
        <Tag status={contact.status} />
      </td>
      <td className="px-4 py-3 text-gray-500">
        {contact.follow_up_at ? formatFollowUp(contact.follow_up_at) : "—"}
      </td>
      <td className="px-4 py-3 text-gray-500">
        {contact.last_call
          ? new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
            }).format(new Date(contact.last_call))
          : "—"}
      </td>
      <td className="px-4 py-3">
        {contact.notes ? (
          <span className="line-clamp-1 text-gray-500">{contact.notes}</span>
        ) : (
          <span className="text-gray-300">Add note</span>
        )}
      </td>
    </tr>
  );
});

export function ContactsTable({ initialContacts }: ContactsTableProps) {
  const router = useRouter();
  const t = useTranslations("contact");
  const tStatus = useTranslations("status");
  const [bulkModal, setBulkModal] = useState<"status" | "list" | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const clientContacts = initialContacts;
  
  const {
    contacts,
    filters,
    sortBy,
    sortDirection,
    selectedIds,
    processing,
    error,
    groupByCanton,
    toggleGroupByCanton,
    applyFilters,
    applySort,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    runBulkAction,
  } = useContactsTable({ contacts: clientContacts, lists: [] });

  const virtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const availableCantons = useMemo(
    () =>
      Array.from(
        new Set(
          clientContacts
            .map((c) => c.canton)
            .filter((canton): canton is string => Boolean(canton))
        )
      ).sort(),
    [clientContacts]
  );

  const allSelected = useMemo(() => {
    if (contacts.length === 0) return false;
    return contacts.every((contact) => selectedIds.includes(contact.id));
  }, [contacts, selectedIds]);

  const handleBulkStatus = useCallback(
    async (status: ContactStatus) => {
      await runBulkAction({ type: "status", payload: status });
      setBulkModal(null);
    },
    [runBulkAction]
  );

  const handleFilterByCanton = useCallback(
    (canton: string) => {
      applyFilters({
        canton: filters.canton === canton ? "all" : canton,
      });
    },
    [applyFilters, filters.canton]
  );

  const handleImportComplete = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleOpenBulkStatus = useCallback(() => setBulkModal("status"), []);
  const handleOpenBulkList = useCallback(() => setBulkModal("list"), []);
  const handleBulkDelete = useCallback(() => runBulkAction({ type: "delete" }), [runBulkAction]);
  const handleCloseBulkModal = useCallback(() => setBulkModal(null), []);

  // Fix encoding state and handler
  const [fixingEncoding, setFixingEncoding] = useState(false);
  const handleFixEncoding = useCallback(async () => {
    if (fixingEncoding) return;
    
    const confirmed = window.confirm(
      "This will fix ä, ö, ü encoding issues in all company names, contact names, streets, and cities.\n\nContinue?"
    );
    if (!confirmed) return;

    setFixingEncoding(true);
    try {
      const res = await fetch("/api/contacts/fix-encoding", { method: "POST" });
      const data = await res.json();
      
      if (res.ok) {
        alert(`✅ Fixed encoding in ${data.fixed} of ${data.total} contacts.`);
        router.refresh();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      alert("❌ Failed to fix encoding. Please try again.");
      console.error(err);
    } finally {
      setFixingEncoding(false);
    }
  }, [fixingEncoding, router]);

  return (
    <section 
      className="flex h-full flex-col"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 md:px-0">
        <TableToolbar
          filters={filters}
          totalCount={clientContacts.length}
          selectedCount={selectedIds.length}
          onFilterChange={applyFilters}
          onOpenBulkStatus={handleOpenBulkStatus}
          onOpenBulkList={handleOpenBulkList}
          onBulkDelete={handleBulkDelete}
          onFixEncoding={handleFixEncoding}
          fixingEncoding={fixingEncoding}
          groupByCanton={groupByCanton}
          onToggleGroupByCanton={toggleGroupByCanton}
          availableCantons={availableCantons}
        />
        <ContactsImporter onImportComplete={handleImportComplete} />
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div ref={parentRef} className="flex-1 overflow-auto">
        <table className="min-w-full">
          <thead className="sticky top-0 z-10 bg-white text-left text-xs uppercase tracking-wide text-gray-400">
            <tr>
              <th className="w-10 px-4 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </th>
              <SortableHeader
                label={t("company")}
                column="company_name"
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={applySort}
              />
              <SortableHeader
                label="Team"
                column="contact_name"
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={applySort}
              />
              <SortableHeader
                label={t("canton")}
                column="canton"
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={applySort}
              />
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Follow-up</th>
              <SortableHeader
                label="Last Call"
                column="last_call"
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={applySort}
              />
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
            {groupByCanton ? (
              // Non-virtualized when grouping by canton (for section headers)
              contacts.map((contact, index) => {
                const isSelected = selectedIds.includes(contact.id);
                const currentCanton = contact.canton ?? "Unknown Canton";
                const previousCanton = index > 0 ? contacts[index - 1].canton ?? "Unknown Canton" : null;
                const showHeader = index === 0 || previousCanton !== currentCanton;
                return (
                  <Fragment key={contact.id}>
                    {showHeader && (
                      <tr className="bg-gray-50">
                        <td colSpan={8} className="px-4 py-2 text-xs font-semibold text-gray-500">
                          {currentCanton}
                        </td>
                      </tr>
                    )}
                    <ContactTableRow
                      contact={contact}
                      isSelected={isSelected}
                      onToggleSelection={toggleSelection}
                      onFilterByCanton={handleFilterByCanton}
                    />
                  </Fragment>
                );
              })
            ) : (
              // Virtualized rows when not grouping
              <>
                {(() => {
                  const virtualRows = virtualizer.getVirtualItems();
                  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
                  const paddingBottom =
                    virtualRows.length > 0
                      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
                      : 0;
                  return (
                    <>
                      {paddingTop > 0 && (
                        <tr>
                          <td colSpan={8} style={{ height: `${paddingTop}px` }} />
                        </tr>
                      )}
                      {virtualRows.map((virtualRow) => {
                        const contact = contacts[virtualRow.index];
                        const isSelected = selectedIds.includes(contact.id);
                        return (
                          <ContactTableRow
                            key={contact.id}
                            contact={contact}
                            isSelected={isSelected}
                            onToggleSelection={toggleSelection}
                            onFilterByCanton={handleFilterByCanton}
                          />
                        );
                      })}
                      {paddingBottom > 0 && (
                        <tr>
                          <td colSpan={8} style={{ height: `${paddingBottom}px` }} />
                        </tr>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </tbody>
        </table>

        {contacts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-500">
            <p>No companies found. Import a CSV to get started!</p>
            <Button variant="secondary" onClick={() => applyFilters({ search: "", status: "all", canton: "all" })}>
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <footer className="sticky bottom-0 flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3 text-sm text-gray-500">
          <div>{selectedIds.length} contacts selected</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <Button variant="secondary" size="sm" onClick={handleOpenBulkStatus}>
              Update Status
            </Button>
            <Button variant="secondary" size="sm" onClick={handleOpenBulkList}>
              Assign List
            </Button>
            <Button variant="danger" size="sm" onClick={handleBulkDelete}>
              Delete
            </Button>
          </div>
        </footer>
      )}

      {bulkModal === "status" && (
        <div className="fixed inset-0 z-50 bg-black/30">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900">Update Status</h3>
              <p className="mt-1 text-sm text-gray-500">
                Apply a new status to {selectedIds.length} selected contacts.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(Object.keys(CONTACT_STATUS_LABELS) as ContactStatus[]).map((status) => (
                  <Button
                    key={status}
                    variant="secondary"
                    onClick={() => handleBulkStatus(status)}
                    disabled={processing}
                  >
                    {CONTACT_STATUS_LABELS[status]}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" className="mt-4 w-full" onClick={handleCloseBulkModal}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const SortableHeader = memo(function SortableHeader({
  label,
  column,
  sortBy,
  sortDirection,
  onSort,
}: {
  label: string;
  column: keyof Contact;
  sortBy: keyof Contact;
  sortDirection: "asc" | "desc";
  onSort: (column: keyof Contact) => void;
}) {
  const isActive = sortBy === column;
  const handleClick = useCallback(() => {
    onSort(column);
  }, [onSort, column]);

  return (
    <th
      className="px-4 py-2 cursor-pointer select-none text-gray-500 hover:text-gray-900"
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive && <span>{sortDirection === "asc" ? "▲" : "▼"}</span>}
      </div>
    </th>
  );
});

function formatFollowUp(value: string) {
  const date = new Date(value);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const isPast = date < new Date();
  return isPast ? `${formatted} • due` : formatted;
}
