"use client";

import { memo } from "react";
import type { Vacancy } from "@/lib/types";
import type { VacancyStatus } from "@/lib/utils/constants";
import { VACANCY_STATUS_LIST, VACANCY_STATUS_LABELS, VACANCY_STATUS_COLORS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

interface Props {
  vacancies: Vacancy[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  statusFilter: VacancyStatus | null;
  onStatusFilterChange: (status: VacancyStatus | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isMobile?: boolean;
}

export const VacancyList = memo(function VacancyList({
  vacancies,
  activeId,
  onSelect,
  onCreateNew,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchChange,
  isMobile = false,
}: Props) {
  return (
    <aside className={cn(
      "flex flex-col border-r border-gray-200 bg-white",
      isMobile ? "w-full h-full" : "w-80"
    )}>
      {/* Header */}
      <header 
        className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4"
        style={isMobile ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" } : undefined}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Vakanzen</h1>
          <button
            onClick={onCreateNew}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Suchen..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-0"
          />
        </div>

        {/* Status Filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => onStatusFilterChange(null)}
            className={cn(
              "flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === null
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            Alle
          </button>
          {VACANCY_STATUS_LIST.map((status) => (
            <button
              key={status}
              onClick={() => onStatusFilterChange(statusFilter === status ? null : status)}
              className={cn(
                "flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === status
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {VACANCY_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </header>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {vacancies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.073c0 1.078-.875 1.953-1.953 1.953H5.703c-1.078 0-1.953-.875-1.953-1.953V14.15M12 9.75v6M15 12.75H9M8.25 3.75h7.5a2.25 2.25 0 012.25 2.25v9.75H6V6a2.25 2.25 0 012.25-2.25z" />
              </svg>
            </div>
            <p className="mt-3 text-sm text-gray-500">Keine Vakanzen gefunden</p>
            <button
              onClick={onCreateNew}
              className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Neue Vakanz erstellen
            </button>
          </div>
        ) : (
          <ul>
            {vacancies.map((vacancy) => (
              <li key={vacancy.id}>
                <button
                  onClick={() => onSelect(vacancy.id)}
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors border-b border-gray-100",
                    activeId === vacancy.id
                      ? "bg-blue-50"
                      : "hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {vacancy.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {vacancy.contact?.company_name || "Unbekannt"}
                      </p>
                      {vacancy.city && (
                        <p className="mt-0.5 truncate text-xs text-gray-400">
                          {vacancy.city}
                          {vacancy.radius_km && ` • ${vacancy.radius_km}km`}
                        </p>
                      )}
                    </div>
                    <span className={cn(
                      "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border",
                      VACANCY_STATUS_COLORS[vacancy.status]
                    )}>
                      {VACANCY_STATUS_LABELS[vacancy.status]}
                    </span>
                  </div>
                  {vacancy.min_quality && (
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">Min:</span>
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        vacancy.min_quality === "A" ? "bg-green-100 text-green-700" :
                        vacancy.min_quality === "B" ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        {vacancy.min_quality}
                      </span>
                      {typeof vacancy.candidate_count === "number" && vacancy.candidate_count > 0 && (
                        <span className="ml-auto text-[10px] text-gray-400">
                          {vacancy.candidate_count} Kandidaten
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
});
