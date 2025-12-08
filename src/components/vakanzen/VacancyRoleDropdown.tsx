"use client";

import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { TmaRole, Team } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { ROLE_COLOR_SWATCHES } from "@/lib/utils/constants";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

interface Props {
  value: string | null;
  roles: TmaRole[];
  teams: Team[];
  onChange: (roleName: string | null) => void;
  onCreateRole?: (payload: { name: string; color: string; note?: string | null }) => Promise<TmaRole>;
  onRefreshRoles?: () => Promise<void>;
  placeholder?: string;
}

export const VacancyRoleDropdown = memo(function VacancyRoleDropdown({
  value,
  roles,
  teams,
  onChange,
  onCreateRole,
  onRefreshRoles,
  placeholder = "Rolle auswählen",
}: Props) {
  const [open, setOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState<string>(ROLE_COLOR_SWATCHES[0]);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find selected role
  const normalizedValue = (value ?? "").trim().toLowerCase();
  const selectedRole = useMemo(
    () => roles.find((role) => role.name.trim().toLowerCase() === normalizedValue) || null,
    [roles, normalizedValue]
  );

  // Group roles by team
  const rolesByTeam = useMemo(() => {
    const grouped = new Map<string, TmaRole[]>();
    
    // First, add "All Teams" group for roles without team or unknown team
    const teamsMap = new Map(teams.map(t => [t.id, t]));
    
    roles.forEach((role) => {
      const teamId = role.team_id || "unknown";
      if (!grouped.has(teamId)) {
        grouped.set(teamId, []);
      }
      grouped.get(teamId)!.push(role);
    });

    // Convert to array sorted by team name
    return Array.from(grouped.entries())
      .map(([teamId, teamRoles]) => ({
        team: teamsMap.get(teamId) || { id: teamId, name: "Andere", color: "#9CA3AF" },
        roles: teamRoles.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.team.name.localeCompare(b.team.name));
  }, [roles, teams]);

  // Close on outside click
  const handleDocumentClick = useCallback(
    (event: MouseEvent) => {
      if (!open) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setShowCreateForm(false);
      }
    },
    [open]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [handleDocumentClick]);

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

  return (
    <div className="relative" ref={containerRef}>
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
          <div className="flex-1 overflow-y-auto">
            {rolesByTeam.length === 0 && !showCreateForm && (
              <p className="px-4 py-3 text-sm text-gray-500">Keine Rollen vorhanden.</p>
            )}
            
            {rolesByTeam.map(({ team, roles: teamRoles }) => (
              <div key={team.id}>
                {/* Team header */}
                <div className="sticky top-0 bg-gray-50 px-3 py-1.5 border-b border-gray-100">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded text-white"
                    style={{ backgroundColor: team.color || "#9CA3AF" }}
                  >
                    {team.name}
                  </span>
                </div>
                
                {/* Roles in team */}
                {teamRoles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => {
                      onChange(role.name);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-50",
                      selectedRole?.id === role.id && "bg-blue-50"
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                    <span className="flex-1 text-gray-900 truncate">{role.name}</span>
                  </button>
                ))}
              </div>
            ))}
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
