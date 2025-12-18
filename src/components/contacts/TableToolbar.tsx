"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ContactStatus } from "@/lib/utils/constants";
import { CONTACT_STATUS_LABELS, CONTACT_STATUS_LIST } from "@/lib/utils/constants";
import type { ContactsTableFilters } from "@/lib/hooks/useContactsTable";

interface TableToolbarProps {
  filters: ContactsTableFilters;
  totalCount: number;
  selectedCount: number;
  onFilterChange: (filters: Partial<ContactsTableFilters>) => void;
  onOpenBulkStatus: () => void;
  onOpenBulkList: () => void;
  onBulkDelete: () => void;
  onFixEncoding: () => void;
  fixingEncoding?: boolean;
  onMergeDuplicates: () => void;
  mergingDuplicates?: boolean;
  groupByCanton: boolean;
  onToggleGroupByCanton: () => void;
  availableCantons?: string[];
}

export function TableToolbar({
  filters,
  totalCount,
  selectedCount,
  onFilterChange,
  onOpenBulkStatus,
  onOpenBulkList,
  onBulkDelete,
  onFixEncoding,
  fixingEncoding = false,
  onMergeDuplicates,
  mergingDuplicates = false,
  groupByCanton,
  onToggleGroupByCanton,
  availableCantons = [],
}: TableToolbarProps) {
  const t = useTranslations("contact");
  const tCommon = useTranslations("common");
  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const [cantonPickerOpen, setCantonPickerOpen] = useState(false);

  return (
    <section className="card-surface mb-4 flex flex-wrap items-center justify-between gap-3 border border-gray-100 px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={t("search")}
          value={searchValue}
          onChange={(event) => {
            setSearchValue(event.target.value);
            onFilterChange({ search: event.target.value });
          }}
          className="w-64"
        />
        <StatusFilter
          value={filters.status ?? "all"}
          onChange={(status) => onFilterChange({ status })}
        />
        <Button
          variant={groupByCanton ? "primary" : "secondary"}
          size="sm"
          onClick={onToggleGroupByCanton}
        >
          {groupByCanton ? "Grouped by Canton" : "Group by Canton"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCantonPickerOpen((prev) => !prev)}
        >
          {filters.canton && filters.canton !== "all"
            ? `Canton: ${filters.canton}`
            : "Filter Canton"}
        </Button>
        <Badge tone="muted">Total: {totalCount}</Badge>
        {selectedCount > 0 && <Badge tone="default">Selected: {selectedCount}</Badge>}
      </div>

      {cantonPickerOpen && (
        <div className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filters.canton === "all" ? "primary" : "secondary"}
              onClick={() => {
                onFilterChange({ canton: "all" });
                setCantonPickerOpen(false);
              }}
            >
              All Cantons
            </Button>
            {availableCantons.map((canton) => (
              <Button
                key={canton}
                size="sm"
                variant={filters.canton === canton ? "primary" : "secondary"}
                onClick={() => {
                  onFilterChange({ canton });
                  setCantonPickerOpen(false);
                }}
              >
                {canton}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onFixEncoding}
          disabled={fixingEncoding || mergingDuplicates}
          title="Fix ä, ö, ü encoding issues (Admin only)"
        >
          {fixingEncoding ? "Scanning..." : "🔧 Fix Encoding"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onMergeDuplicates}
          disabled={mergingDuplicates || fixingEncoding}
          title="Merge duplicate companies (Admin only)"
        >
          {mergingDuplicates ? "Scanning..." : "🔗 Merge Duplicates"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={selectedCount === 0}
          onClick={onOpenBulkStatus}
        >
          Update Status
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={selectedCount === 0}
          onClick={onOpenBulkList}
        >
          Assign to List
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={selectedCount === 0}
          onClick={onBulkDelete}
        >
          Delete
        </Button>
      </div>
    </section>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: ContactStatus | "all";
  onChange: (status: ContactStatus | "all") => void;
}) {
  return (
    <div className="flex gap-1 rounded-full border border-gray-200 bg-white p-1">
      <FilterChip active={value === "all"} onClick={() => onChange("all")}>
        All
      </FilterChip>
      {CONTACT_STATUS_LIST.map((status) => (
        <FilterChip
          key={status}
          active={value === status}
          onClick={() => onChange(status)}
          className="capitalize"
        >
          {CONTACT_STATUS_LABELS[status]}
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({
  children,
  active,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-3 py-1 text-xs font-medium transition",
        active ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

