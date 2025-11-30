"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact } from "@/lib/types";
import type { ContactStatus } from "@/lib/utils/constants";
import { CONTACT_STATUS_LABELS } from "@/lib/utils/constants";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { useContactsTable } from "@/lib/hooks/useContactsTable";
import { TableToolbar } from "./TableToolbar";
import { CantonTag } from "@/components/ui/CantonTag";
import { cn } from "@/lib/utils/cn";
import { AnimatePresence, motion } from "framer-motion";
import { ContactsImporter } from "./ContactsImporter";

interface ContactsTableProps {
  initialContacts: Contact[];
}

export function ContactsTable({ initialContacts }: ContactsTableProps) {
  const router = useRouter();
  const [clientContacts, setClientContacts] = useState(initialContacts);
  const [bulkModal, setBulkModal] = useState<"status" | "list" | null>(null);
  
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

  const handleBulkStatus = async (status: ContactStatus) => {
    await runBulkAction({ type: "status", payload: status });
    setBulkModal(null);
  };

  const handleFilterByCanton = (canton: string) => {
    applyFilters({
      canton: filters.canton === canton ? "all" : canton,
    });
  };

  const handleImportComplete = (newContacts: Contact[]) => {
    setClientContacts(newContacts);
    router.refresh();
  };

  return (
    <section className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TableToolbar
          filters={filters}
          totalCount={clientContacts.length}
          selectedCount={selectedIds.length}
          onFilterChange={applyFilters}
          onOpenBulkStatus={() => setBulkModal("status")}
          onOpenBulkList={() => setBulkModal("list")}
          onBulkDelete={() => runBulkAction({ type: "delete" })}
          groupByCanton={groupByCanton}
          onToggleGroupByCanton={toggleGroupByCanton}
          availableCantons={availableCantons}
        />
        <ContactsImporter onImported={handleImportComplete} />
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px 6 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="min-w-full">
          <thead className="sticky top-0 z-10 bg-white text-left text-xs uppercase tracking-wide text-gray-400">
            <tr>
              <th className="w-10 px-4 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </th>
              <SortableHeader
                label="Company"
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
                label="Canton"
                column="canton"
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={applySort}
              />
              <th className="px-4 py-2">Status</th>
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
            <AnimatePresence initial={false}>
              {contacts.map((contact, index) => {
                const isSelected = selectedIds.includes(contact.id);
                const currentCanton = contact.canton ?? "Unknown Canton";
                const previousCanton = index > 0 ? contacts[index - 1].canton ?? "Unknown Canton" : null;
                const showHeader =
                  groupByCanton && (index === 0 || previousCanton !== currentCanton);
                return (
                  <Fragment key={contact.id}>
                    {showHeader && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-4 py-2 text-xs font-semibold text-gray-500">
                          {currentCanton}
                        </td>
                      </tr>
                    )}
                    <motion.tr
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className={cn(
                        isSelected ? "bg-gray-50" : "",
                        "hover:bg-white hover:shadow-sm"
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(contact.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{contact.company_name}</td>
                      <td className="px-4 py-3">{contact.contact_name ?? "Hiring Team"}</td>
                      <td className="px-4 py-3">
                        <CantonTag canton={contact.canton} onClick={handleFilterByCanton} />
                      </td>
                      <td className="px-4 py-3">
                        <Tag status={contact.status} />
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
                    </motion.tr>
                  </Fragment>
                );
              })}
            </AnimatePresence>
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
            <Button variant="secondary" size="sm" onClick={() => setBulkModal("status")}>
              Update Status
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setBulkModal("list")}>
              Assign List
            </Button>
            <Button variant="danger" size="sm" onClick={() => runBulkAction({ type: "delete" })}>
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
              <Button variant="ghost" className="mt-4 w-full" onClick={() => setBulkModal(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SortableHeader({
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
  return (
    <th
      className="px-4 py-2 cursor-pointer select-none text-gray-500 hover:text-gray-900"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive && <span>{sortDirection === "asc" ? "▲" : "▼"}</span>}
      </div>
    </th>
  );
}
