"use client";

import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { TmaRole, Team } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { ROLE_COLOR_SWATCHES } from "@/lib/utils/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  value: string | null;
  roles: TmaRole[];
  teams: Team[];
  onChange: (roleName: string | null) => void;
  onCreateRole?: (payload: { name: string; color: string; note?: string | null }) => Promise<TmaRole>;
  onRefreshRoles?: () => Promise<void>;
  placeholder?: string;
  currentUserTeamId?: string | null;
}

export const VacancyRoleDropdown = memo(function VacancyRoleDropdown({
  value,
  roles,
  teams,
  onChange,
  onCreateRole,
  onRefreshRoles,
  placeholder = "Rolle auswählen",
  currentUserTeamId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState<string>(ROLE_COLOR_SWATCHES[0]);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find selected role
  const normalizedValue = (value ?? "").trim().toLowerCase();
  const selectedRole = useMemo(
    () => roles.find((role) => role.name.trim().toLowerCase() === normalizedValue) || null,
    [roles, normalizedValue]
  );

  // Group and sort roles by team - user's team first
  const rolesByTeam = useMemo(() => {
    const grouped = new Map<string, TmaRole[]>();
    const teamsMap = new Map(teams.map(t => [t.id, t]));
    
    roles.forEach((role) => {
      const teamId = role.team_id || "unknown";
      if (!grouped.has(teamId)) {
        grouped.set(teamId, []);
      }
      grouped.get(teamId)!.push(role);
    });

    // Convert to array
    const result = Array.from(grouped.entries())
      .map(([teamId, teamRoles]) => ({
        team: teamsMap.get(teamId) || { id: teamId, name: "Andere", color: "#9CA3AF" },
        roles: teamRoles.sort((a, b) => a.name.localeCompare(b.name)),
      }));
    
    // Sort: user's team first, then alphabetically
    return result.sort((a, b) => {
      // User's team comes first
      if (currentUserTeamId) {
        if (a.team.id === currentUserTeamId && b.team.id !== currentUserTeamId) return -1;
        if (b.team.id === currentUserTeamId && a.team.id !== currentUserTeamId) return 1;
      }
      // Then alphabetically
      return a.team.name.localeCompare(b.team.name);
    });
  }, [roles, teams, currentUserTeamId]);

  // Filter roles based on search query
  const filteredRolesByTeam = useMemo(() => {
    if (!searchQuery.trim()) return rolesByTeam;
    
    const query = searchQuery.toLowerCase().trim();
    return rolesByTeam
      .map(({ team, roles: teamRoles }) => ({
        team,
        roles: teamRoles.filter(role => 
          role.name.toLowerCase().includes(query)
        ),
      }))
      .filter(({ roles: teamRoles }) => teamRoles.length > 0);
  }, [rolesByTeam, searchQuery]);

  // Flat list of filtered roles for keyboard navigation
  const flatFilteredRoles = useMemo(() => {
    return filteredRolesByTeam.flatMap(({ roles: teamRoles }) => teamRoles);
  }, [filteredRolesByTeam]);

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      // Small delay to ensure the dropdown is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 10);
    }
    if (!open) {
      setSearchQuery("");
      setHighlightedIndex(0);
      setShowCreateForm(false);
    }
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const highlightedElement = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
    if (highlightedElement) {
      highlightedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlightedIndex, open]);

  // Close on outside click
  const handleDocumentClick = useCallback(
    (event: MouseEvent) => {
      if (!open) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    },
    [open]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [handleDocumentClick]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < flatFilteredRoles.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case "Enter":
        e.preventDefault();
        if (flatFilteredRoles[highlightedIndex]) {
          onChange(flatFilteredRoles[highlightedIndex].name);
          setOpen(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  }, [open, flatFilteredRoles, highlightedIndex, onChange]);

  const handleCreateRole = async () => {
    if (!newRoleName.trim() || !onCreateRole) return;
    setCreating(true);
    try {
      const role = await onCreateRole({ name: newRoleName.trim(), color: newRoleColor });
      onChange(role.name);
      setNewRoleName("");
      setShowCreateForm(false);
      setOpen(false);
      if (onRefreshRoles) await onRefreshRoles();
    } catch {
      // Error handled upstream
    } finally {
      setCreating(false);
    }
  };

  const selectRole = useCallback((roleName: string) => {
    onChange(roleName);
    setOpen(false);
  }, [onChange]);

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
          selectedRole
            ? "border-gray-300 text-gray-900"
            : "border-dashed border-gray-300 text-gray-500"
        )}
      >
        <span className="flex items-center gap-2">
          {selectedRole ? (
            <>
              <span
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: selectedRole.color }}
              />
              <span className="font-medium truncate">{selectedRole.name}</span>
              {selectedRole.team && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded text-white flex-shrink-0"
                  style={{ backgroundColor: selectedRole.team.color || "#9CA3AF" }}
                >
                  {selectedRole.team.name}
                </span>
              )}
            </>
          ) : (
            placeholder
          )}
        </span>
        <svg
          className={cn("h-4 w-4 text-gray-400 transition flex-shrink-0", open && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg max-h-80 overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rolle suchen..."
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-0"
            />
          </div>

          {/* Roles list */}
          <div className="flex-1 overflow-y-auto" ref={listRef}>
            {filteredRolesByTeam.length === 0 && !showCreateForm && (
              <p className="px-4 py-3 text-sm text-gray-500">
                {searchQuery ? "Keine Rollen gefunden." : "Keine Rollen vorhanden."}
              </p>
            )}
            
            {filteredRolesByTeam.map(({ team, roles: teamRoles }) => {
              // Calculate the starting index for this team's roles
              let startIndex = 0;
              for (const { team: t, roles: r } of filteredRolesByTeam) {
                if (t.id === team.id) break;
                startIndex += r.length;
              }

              return (
                <div key={team.id}>
                  {/* Team header */}
                  <div className="sticky top-0 bg-gray-50 px-3 py-1.5 border-b border-gray-100 flex items-center gap-2">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded text-white"
                      style={{ backgroundColor: team.color || "#9CA3AF" }}
                    >
                      {team.name}
                    </span>
                    {team.id === currentUserTeamId && (
                      <span className="text-[10px] text-gray-400">(Mein Team)</span>
                    )}
                  </div>
                  
                  {/* Roles in team */}
                  {teamRoles.map((role, idx) => {
                    const globalIndex = startIndex + idx;
                    const isHighlighted = globalIndex === highlightedIndex;
                    
                    return (
                      <button
                        key={role.id}
                        type="button"
                        data-index={globalIndex}
                        onClick={() => selectRole(role.name)}
                        onMouseEnter={() => setHighlightedIndex(globalIndex)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                          isHighlighted && "bg-blue-50",
                          selectedRole?.id === role.id && "font-medium",
                          !isHighlighted && "hover:bg-gray-50"
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: role.color }}
                        />
                        <span className="flex-1 text-gray-900 truncate">{role.name}</span>
                        {selectedRole?.id === role.id && (
                          <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Create form or actions */}
          {showCreateForm ? (
            <div className="border-t border-gray-100 px-4 py-3 bg-white">
              <p className="text-xs font-medium uppercase text-gray-400 mb-2">Neue Rolle</p>
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Rollenname"
                className="mb-2"
              />
              <ColorSwatches value={newRoleColor} onChange={setNewRoleColor} />
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={handleCreateRole} disabled={creating || !newRoleName.trim()}>
                  {creating ? "Speichern…" : "Erstellen"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewRoleName("");
                  }}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-white">
              {onCreateRole && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowCreateForm(true)}
                >
                  + Neue Rolle
                </Button>
              )}
              {selectedRole && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Rolle entfernen
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// Color swatches for role creation
function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLE_COLOR_SWATCHES.map((color) => (
        <button
          type="button"
          key={color}
          onClick={() => onChange(color)}
          className={cn(
            "h-6 w-6 rounded-full border-2 transition",
            value === color ? "border-gray-900" : "border-transparent"
          )}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  );
}
