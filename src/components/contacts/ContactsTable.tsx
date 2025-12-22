"use client";

import { Fragment, memo, useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Contact } from "@/lib/types";
import type { ContactStatus } from "@/lib/utils/constants";
import { CONTACT_STATUS_LABELS } from "@/lib/utils/constants";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { useContactsTable } from "@/lib/hooks/useContactsTable";
import { TableToolbar } from "./TableToolbar";
import { TeamFilter } from "./TeamFilter";
import { CantonTag } from "@/components/ui/CantonTag";
import { cn } from "@/lib/utils/cn";
import { ContactsImporter } from "./ContactsImporter";
import { OutlookSyncButton } from "./OutlookSyncButton";
import { CleanupModal } from "./CleanupModal";
import { fixContactDisplay } from "@/lib/utils/client-encoding-fix";
import { getSpecializationLabel } from "@/lib/utils/outlook-specialization";

interface ContactsTableProps {
  initialContacts: Contact[];
  currentUserTeamId: string | null;
  initialTeamFilter: string | "all";
  userEmail?: string | null;
}

const ROW_HEIGHT = 64; // Approximate height of each table row

// Get row background based on specialization
function getRowBackground(specialization: string | null, isSelected: boolean): string {
  if (isSelected) return "bg-gray-100";
  if (specialization === "holzbau") return "bg-amber-50/50";
  if (specialization === "dachdecker") return "bg-stone-50/50";
  return "";
}

// Specialization badge component
const SpecializationBadge = memo(function SpecializationBadge({ 
  specialization,
  onClick,
}: { 
  specialization: string | null;
  onClick?: (spec: string) => void;
}) {
  if (!specialization) return <span className="text-gray-300">—</span>;
  
  const label = getSpecializationLabel(specialization).split(" / ")[0];
  const colorClass = specialization === "holzbau" 
    ? "bg-amber-100 text-amber-800 hover:bg-amber-200" 
    : "bg-stone-200 text-stone-700 hover:bg-stone-300";
  
  const handleClick = useCallback(() => {
    onClick?.(specialization);
  }, [onClick, specialization]);
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer",
        colorClass
      )}
    >
      {label}
    </button>
  );
});

// Memoized table row to prevent re-renders
const ContactTableRow = memo(function ContactTableRow({
  contact,
  isSelected,
  onToggleSelection,
  onFilterByCanton,
  onFilterBySpecialization,
}: {
  contact: Contact;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  onFilterByCanton: (canton: string) => void;
  onFilterBySpecialization?: (spec: string) => void;
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

  const handleSpecializationClick = useCallback(
    (value: string) => {
      onFilterBySpecialization?.(value);
    },
    [onFilterBySpecialization]
  );

  const rowBackground = getRowBackground(contact.specialization, isSelected);

  return (
    <tr className={cn(rowBackground, "hover:bg-gray-50/50")}>
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
        <SpecializationBadge 
          specialization={contact.specialization} 
          onClick={handleSpecializationClick}
        />
      </td>
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

export function ContactsTable({ initialContacts, currentUserTeamId, initialTeamFilter, userEmail }: ContactsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("contact");
  const tStatus = useTranslations("status");
  
  // Handle team filter change
  const handleTeamFilterChange = useCallback((teamId: string | "all") => {
    // Update URL to trigger page re-render with new team filter
    const params = new URLSearchParams(searchParams.toString());
    if (teamId === currentUserTeamId) {
      // Remove param if switching back to user's team (default)
      params.delete("team");
    } else {
      params.set("team", teamId);
    }
    const newUrl = `/contacts?${params.toString()}`;
    // Use window.location.href to force a full page reload with server-side rendering
    window.location.href = newUrl;
  }, [searchParams, currentUserTeamId]);
  
  // Fix encoding issues on initial contacts
  const fixedInitialContacts = useMemo(
    () => initialContacts.map(fixContactDisplay),
    [initialContacts]
  );
  const [bulkModal, setBulkModal] = useState<"status" | "list" | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const clientContacts = fixedInitialContacts;
  
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

  const availableSpecializations = useMemo(
    () =>
      Array.from(
        new Set(
          clientContacts
            .map((c) => c.specialization)
            .filter((spec): spec is string => Boolean(spec))
        )
      ).sort(),
    [clientContacts]
  );

  // Specialization filter state
  const [specializationFilter, setSpecializationFilter] = useState<string | null>(null);

  // Filter contacts by specialization
  const filteredContacts = useMemo(() => {
    if (!specializationFilter) return contacts;
    return contacts.filter((c) => c.specialization === specializationFilter);
  }, [contacts, specializationFilter]);

  const virtualizer = useVirtualizer({
    count: filteredContacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const handleFilterBySpecialization = useCallback(
    (spec: string) => {
      setSpecializationFilter((prev) => (prev === spec ? null : spec));
    },
    []
  );

  const allSelected = useMemo(() => {
    if (filteredContacts.length === 0) return false;
    return filteredContacts.every((contact) => selectedIds.includes(contact.id));
  }, [filteredContacts, selectedIds]);

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

  // Cleanup modal state
  const [cleanupModal, setCleanupModal] = useState<"encoding" | "dedupe" | null>(null);

  const handleFixEncoding = useCallback(() => {
    setCleanupModal("encoding");
  }, []);

  const handleMergeDuplicates = useCallback(() => {
    setCleanupModal("dedupe");
  }, []);

  const handleCleanupComplete = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleCloseCleanupModal = useCallback(() => {
    setCleanupModal(null);
  }, []);

  return (
    <section 
      className="flex h-full flex-col"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 md:px-0">
        <div className="flex items-center gap-4">
          <TableToolbar
            filters={filters}
            totalCount={clientContacts.length}
            selectedCount={selectedIds.length}
            onFilterChange={applyFilters}
            onOpenBulkStatus={handleOpenBulkStatus}
            onOpenBulkList={handleOpenBulkList}
            onBulkDelete={handleBulkDelete}
            onFixEncoding={handleFixEncoding}
            fixingEncoding={cleanupModal === "encoding"}
            onMergeDuplicates={handleMergeDuplicates}
            mergingDuplicates={cleanupModal === "dedupe"}
            groupByCanton={groupByCanton}
            onToggleGroupByCanton={toggleGroupByCanton}
            availableCantons={availableCantons}
          />
          <TeamFilter
            value={initialTeamFilter}
            onChange={handleTeamFilterChange}
            currentUserTeamId={currentUserTeamId}
          />
          {/* Specialization Filter */}
          {availableSpecializations.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={!specializationFilter ? "primary" : "secondary"}
                onClick={() => setSpecializationFilter(null)}
                className="text-xs"
              >
                Alle
              </Button>
              {availableSpecializations.map((spec) => (
                <Button
                  key={spec}
                  size="sm"
                  variant={specializationFilter === spec ? "primary" : "secondary"}
                  onClick={() => handleFilterBySpecialization(spec)}
                  className={cn(
                    "text-xs",
                    spec === "holzbau" && specializationFilter === spec && "bg-amber-100 text-amber-800",
                    spec === "dachdecker" && specializationFilter === spec && "bg-stone-200 text-stone-700"
                  )}
                >
                  {getSpecializationLabel(spec).split(" / ")[0]}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <OutlookSyncButton userEmail={userEmail ?? null} onSyncComplete={handleImportComplete} />
          <ContactsImporter onImportComplete={handleImportComplete} />
        </div>
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
              <th className="px-4 py-2">
                <div className="flex items-center gap-1">
                  Branche
                  {specializationFilter && (
                    <button
                      onClick={() => setSpecializationFilter(null)}
                      className="ml-1 text-blue-500 hover:text-blue-700"
                      title="Filter aufheben"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </th>
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
              filteredContacts.map((contact, index) => {
                const isSelected = selectedIds.includes(contact.id);
                const currentCanton = contact.canton ?? "Unknown Canton";
                const previousCanton = index > 0 ? filteredContacts[index - 1].canton ?? "Unknown Canton" : null;
                const showHeader = index === 0 || previousCanton !== currentCanton;
                return (
                  <Fragment key={contact.id}>
                    {showHeader && (
                      <tr className="bg-gray-50">
                        <td colSpan={9} className="px-4 py-2 text-xs font-semibold text-gray-500">
                          {currentCanton}
                        </td>
                      </tr>
                    )}
                    <ContactTableRow
                      contact={contact}
                      isSelected={isSelected}
                      onToggleSelection={toggleSelection}
                      onFilterByCanton={handleFilterByCanton}
                      onFilterBySpecialization={handleFilterBySpecialization}
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
                          <td colSpan={9} style={{ height: `${paddingTop}px` }} />
                        </tr>
                      )}
                      {virtualRows.map((virtualRow) => {
                        const contact = filteredContacts[virtualRow.index];
                        const isSelected = selectedIds.includes(contact.id);
                        return (
                          <ContactTableRow
                            key={contact.id}
                            contact={contact}
                            isSelected={isSelected}
                            onToggleSelection={toggleSelection}
                            onFilterByCanton={handleFilterByCanton}
                            onFilterBySpecialization={handleFilterBySpecialization}
                          />
                        );
                      })}
                      {paddingBottom > 0 && (
                        <tr>
                          <td colSpan={9} style={{ height: `${paddingBottom}px` }} />
                        </tr>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </tbody>
        </table>

        {filteredContacts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-500">
            <p>No companies found. Import a CSV to get started!</p>
            <Button variant="secondary" onClick={() => {
              applyFilters({ search: "", status: "all", canton: "all" });
              setSpecializationFilter(null);
            }}>
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

      {cleanupModal && (
        <CleanupModal
          type={cleanupModal}
          onClose={handleCloseCleanupModal}
          onComplete={handleCleanupComplete}
        />
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
