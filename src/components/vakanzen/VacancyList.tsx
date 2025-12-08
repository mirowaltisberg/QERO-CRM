"use client";

import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Vacancy, TmaRole, Team } from "@/lib/types";
import type { VacancyStatus } from "@/lib/utils/constants";
import { VACANCY_STATUS_LIST, VACANCY_STATUS_LABELS, VACANCY_STATUS_COLORS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { UrgencyBadge } from "./UrgencyBadge";
import type { VacancySortBy } from "./VakanzenView";

interface Props {
  vacancies: Vacancy[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  statusFilter: VacancyStatus | null;
  onStatusFilterChange: (status: VacancyStatus | null) => void;
  roleFilter: string | null;
  onRoleFilterChange: (role: string | null) => void;
  teamFilter: string | null;
  onTeamFilterChange: (teamId: string | null) => void;
  sortBy: VacancySortBy;
  onSortByChange: (sort: VacancySortBy) => void;
  sortDir: "asc" | "desc";
  onSortDirChange: (dir: "asc" | "desc") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  roles: TmaRole[];
  teams: Team[];
  isMobile?: boolean;
}

const SORT_OPTIONS: { value: VacancySortBy; label: string }[] = [
  { value: "date", label: "Datum" },
  { value: "urgency", label: "Dringlichkeit" },
  { value: "status", label: "Status" },
  { value: "candidates", label: "Kandidaten" },
];

export const VacancyList = memo(function VacancyList({
  vacancies,
  activeId,
  onSelect,
  onCreateNew,
  statusFilter,
  onStatusFilterChange,
  roleFilter,
  onRoleFilterChange,
  teamFilter,
  onTeamFilterChange,
  sortBy,
  onSortByChange,
  sortDir,
  onSortDirChange,
  searchQuery,
  onSearchChange,
  roles,
  teams,
  isMobile = false,
}: Props) {
  // Filter dropdowns state
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const teamDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setShowRoleDropdown(false);
      }
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(e.target as Node)) {
        setShowTeamDropdown(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Get unique roles from the list
  const uniqueRoles = useMemo(() => {
    const roleNames = new Set<string>();
    roles.forEach(r => roleNames.add(r.name));
    return Array.from(roleNames).sort();
  }, [roles]);

  // Active filter count
  const activeFilterCount = [roleFilter, teamFilter].filter(Boolean).length;

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

        {/* Filter & Sort Row */}
        <div className="flex items-center gap-2">
          {/* Role Filter */}
          <div className="relative" ref={roleDropdownRef}>
            <button
              onClick={() => setShowRoleDropdown(!showRoleDropdown)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                roleFilter
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {roleFilter || "Rolle"}
              <svg className={cn("h-3 w-3 transition-transform", showRoleDropdown && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showRoleDropdown && (
              <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                <button
                  onClick={() => { onRoleFilterChange(null); setShowRoleDropdown(false); }}
                  className={cn(
                    "w-full px-3 py-2 text-left text-xs hover:bg-gray-50",
                    !roleFilter && "bg-gray-50 font-medium"
                  )}
                >
                  Alle Rollen
                </button>
                {uniqueRoles.map((role) => (
                  <button
                    key={role}
                    onClick={() => { onRoleFilterChange(role); setShowRoleDropdown(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs hover:bg-gray-50",
                      roleFilter === role && "bg-blue-50 text-blue-700 font-medium"
                    )}
                  >
                    {role}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Team Filter */}
          <div className="relative" ref={teamDropdownRef}>
            <button
              onClick={() => setShowTeamDropdown(!showTeamDropdown)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                teamFilter
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {teams.find(t => t.id === teamFilter)?.name || "Team"}
              <svg className={cn("h-3 w-3 transition-transform", showTeamDropdown && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTeamDropdown && (
              <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                <button
                  onClick={() => { onTeamFilterChange(null); setShowTeamDropdown(false); }}
                  className={cn(
                    "w-full px-3 py-2 text-left text-xs hover:bg-gray-50",
                    !teamFilter && "bg-gray-50 font-medium"
                  )}
                >
                  Alle Teams
                </button>
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => { onTeamFilterChange(team.id); setShowTeamDropdown(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2",
                      teamFilter === team.id && "bg-blue-50 text-blue-700 font-medium"
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color || "#9CA3AF" }}
                    />
                    {team.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative ml-auto" ref={sortDropdownRef}>
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
              <svg className={cn("h-3 w-3 transition-transform", showSortDropdown && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSortDropdown && (
              <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-gray-200 bg-white shadow-lg">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => { onSortByChange(option.value); setShowSortDropdown(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs hover:bg-gray-50",
                      sortBy === option.value && "bg-gray-50 font-medium"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button
                    onClick={() => { onSortDirChange(sortDir === "asc" ? "desc" : "asc"); setShowSortDropdown(false); }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className={cn("h-3.5 w-3.5", sortDir === "desc" && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                    {sortDir === "asc" ? "Aufsteigend" : "Absteigend"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* List */}
      <div 
        className="flex-1 overflow-y-auto"
        style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" } : undefined}
      >
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
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {vacancy.title}
                        </p>
                        {vacancy.urgency > 1 && (
                          <UrgencyBadge urgency={vacancy.urgency} showLabel={false} size="sm" />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <p className="truncate text-xs text-gray-500">
                          {vacancy.contact?.company_name || "Unbekannt"}
                        </p>
                        {vacancy.contact?.team && (
                          <span
                            className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded text-white"
                            style={{ backgroundColor: vacancy.contact.team.color || "#9CA3AF" }}
                          >
                            {vacancy.contact.team.name}
                          </span>
                        )}
                      </div>
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
                  {(vacancy.min_quality || vacancy.role) && (
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      {vacancy.role && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          {vacancy.role}
                        </span>
                      )}
                      {vacancy.min_quality && (
                        <>
                          <span className="text-[10px] text-gray-400">Min:</span>
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium",
                            vacancy.min_quality === "A" ? "bg-green-100 text-green-700" :
                            vacancy.min_quality === "B" ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                          )}>
                            {vacancy.min_quality}
                          </span>
                        </>
                      )}
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
