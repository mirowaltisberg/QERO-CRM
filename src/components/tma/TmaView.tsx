"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { TmaCandidate, Team } from "@/lib/types";
import type { ExperienceLevel } from "@/lib/utils/constants";
import { useTmaCandidates } from "@/lib/hooks/useTmaCandidates";
import { TmaList } from "./TmaList";
import { TmaDetail } from "./TmaDetail";
import { TmaImporter } from "./TmaImporter";
import { TmaLocationSearch } from "./TmaLocationSearch";
import { TmaCreateModal } from "./TmaCreateModal";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface Props {
  initialCandidates: TmaCandidate[];
  teams: Team[];
  userTeamId: string | null;
}

export function TmaView({ initialCandidates, teams, userTeamId }: Props) {
  const searchParams = useSearchParams();
  const selectFromUrl = searchParams.get("select");
  
  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const {
    candidates,
    allCandidates,
    activeCandidate,
    actionState,
    error,
    selectCandidate,
    refreshCandidates,
    toggleStatusTag,
    updateActivity,
    scheduleFollowUp,
    updateNotes,
    updateQualityNote,
    updateDocuments,
    markAsNotNew,
    teamFilter,
    setTeamFilter,
    updatePosition,
    updateAddress,
    updatePhone,
    updateDrivingLicense,
    updateExperienceLevel,
    clearStatusTags,
    clearActivity,
    setStatusFilter,
    statusFilter,
    setActivityFilter,
    activityFilter,
    setCantonFilter,
    clearCantonFilter,
    availableCantons,
    roles,
    rolesLoading,
    createRole,
    updateRole,
    deleteRole,
    refreshRoles: refreshRolePresets,
    cantonFilter,
    experienceFilter,
    setExperienceFilter,
    sortOption,
    setSortOption,
    searchQuery,
    setSearchQuery,
    locationSearch,
    locationSearchLoading,
    searchByLocation,
    clearLocationSearch,
    updateLocationRadius,
    claimCandidate,
    unclaimCandidate,
    createCandidate,
  } = useTmaCandidates({ initialCandidates, defaultTeamFilter: userTeamId });
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Reset to list view if active candidate is cleared on mobile
  useEffect(() => {
    if (isMobile && !activeCandidate && mobileView === "detail") {
      setMobileView("list");
    }
  }, [isMobile, activeCandidate, mobileView]);

  // Mobile candidate selection handler
  const handleMobileSelectCandidate = useCallback((id: string) => {
    selectCandidate(id);
    if (isMobile) {
      setMobileView("detail");
    }
  }, [selectCandidate, isMobile]);

  // Mobile back handler
  const handleMobileBack = useCallback(() => {
    setMobileView("list");
  }, []);

  // Create candidate handler - opens detail view on mobile after creation
  const handleCreateCandidate = useCallback(
    async (payload: {
      first_name: string;
      last_name: string;
      email?: string | null;
      phone?: string | null;
      team_id?: string | null;
    }) => {
      await createCandidate(payload);
      // On mobile, switch to detail view after creating
      if (isMobile) {
        setMobileView("detail");
      }
    },
    [createCandidate, isMobile]
  );

  // Handle URL-based selection (from command palette)
  useEffect(() => {
    if (selectFromUrl && allCandidates.length > 0) {
      const candidateExists = allCandidates.find((c) => c.id === selectFromUrl);
      if (candidateExists) {
        selectCandidate(selectFromUrl);
        // Clear the URL param without navigation
        window.history.replaceState({}, "", "/tma");
      }
    }
  }, [selectFromUrl, allCandidates, selectCandidate]);

  const handleDeleteCandidate = useCallback(async () => {
    if (!activeCandidate) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/tma/${activeCandidate.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || "Failed to delete");
      }
      setDeleteConfirmOpen(false);
      setMenuOpen(false);
      refreshCandidates();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete candidate");
    } finally {
      setDeleting(false);
    }
  }, [activeCandidate, refreshCandidates]);
  
  const handleLocationSearch = useCallback(
    (query: string, radiusKm: number) => {
      searchByLocation(query, radiusKm);
    },
    [searchByLocation]
  );

  const countByStatus = useMemo(() => {
    return allCandidates.reduce(
      (acc, candidate) => {
        const tags =
          candidate.status_tags && candidate.status_tags.length > 0
            ? candidate.status_tags
            : candidate.status
            ? [candidate.status]
            : [];
        tags.forEach((tag) => {
          if (acc[tag] !== undefined) {
            acc[tag] += 1;
          }
        });
        return acc;
      },
      { A: 0, B: 0, C: 0 }
    );
  }, [allCandidates]);
  const countByActivity = useMemo(() => {
    return allCandidates.reduce(
      (acc, candidate) => {
        if (candidate.activity === "active") acc.active += 1;
        else if (candidate.activity === "inactive") acc.inactive += 1;
        return acc;
      },
      { active: 0, inactive: 0 }
    );
  }, [allCandidates]);

  // ==================== MOBILE ====================
  if (isMobile) {
    return (
      <>
        <div className="relative h-full overflow-hidden bg-gray-50">
          {/* TMA List */}
          <div
            className={`absolute inset-0 bg-gray-50 transition-transform duration-300 ease-out ${
              mobileView === "detail" ? "-translate-x-full" : "translate-x-0"
            }`}
          >
            {/* Mobile Header */}
            <header 
              className="border-b border-gray-200 bg-white px-4 py-3"
              style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">TMA Kandidaten</h1>
                  <p className="text-xs text-gray-500">{allCandidates.length} total</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMenuOpen(!menuOpen)}>
                    ⋯
                  </Button>
                </div>
              </div>
              {/* Mobile filter pills */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <button
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                  onClick={() => setStatusFilter("all")}
                >
                  All
                </button>
                <button
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === "A" ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                  onClick={() => setStatusFilter("A")}
                >
                  A ({countByStatus.A})
                </button>
                <button
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === "B" ? "bg-yellow-500 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                  onClick={() => setStatusFilter("B")}
                >
                  B ({countByStatus.B})
                </button>
                <button
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === "C" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                  onClick={() => setStatusFilter("C")}
                >
                  C ({countByStatus.C})
                </button>
                <div className="shrink-0 w-px bg-gray-200 mx-1" />
                <button
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activityFilter === "active" ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                  onClick={() => setActivityFilter(activityFilter === "active" ? "all" : "active")}
                >
                  Aktiv
                </button>
                <button
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activityFilter === "inactive" ? "bg-gray-500 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                  onClick={() => setActivityFilter(activityFilter === "inactive" ? "all" : "inactive")}
                >
                  Inaktiv
                </button>
                <div className="shrink-0 w-px bg-gray-200 mx-1" />
                <select
                  className="shrink-0 rounded-full border-0 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600"
                  value={teamFilter ?? ""}
                  onChange={(e) => setTeamFilter(e.target.value || null)}
                >
                  <option value="">Alle Teams</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            </header>
            
            <TmaList 
              candidates={candidates} 
              activeId={activeCandidate?.id ?? null} 
              onSelect={handleMobileSelectCandidate}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              isMobile={true}
            />
          </div>

          {/* TMA Detail */}
          <div
            className={`absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-out ${
              mobileView === "detail" ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {/* Mobile Detail Header */}
            <header 
              className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0"
              style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
            >
              <button 
                onClick={handleMobileBack}
                className="flex items-center justify-center w-8 h-8 -ml-2 rounded-lg text-gray-600 active:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-semibold text-gray-900 truncate">
                  {activeCandidate ? `${activeCandidate.first_name} ${activeCandidate.last_name}` : "Kandidat"}
                </h1>
                {activeCandidate?.position_title && (
                  <p className="text-xs text-gray-500 truncate">{activeCandidate.position_title}</p>
                )}
              </div>

              {/* Status badges */}
              {activeCandidate && (
                <div className="flex gap-1">
                  {activeCandidate.status_tags?.includes("A") && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">A</span>
                  )}
                  {activeCandidate.status_tags?.includes("B") && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">B</span>
                  )}
                  {activeCandidate.status_tags?.includes("C") && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">C</span>
                  )}
                </div>
              )}
            </header>

            {/* Detail Content */}
            <div className="flex-1 overflow-y-auto">
              <TmaDetail
                key={`${activeCandidate?.id ?? "empty"}-${activeCandidate?.status_tags?.join(",") ?? ""}-${activeCandidate?.follow_up_at ?? ""}-${activeCandidate?.activity ?? ""}`}
                candidate={activeCandidate}
                roles={roles}
                rolesLoading={rolesLoading}
                onCreateRole={createRole}
                onUpdateRoleMetadata={updateRole}
                onDeleteRole={deleteRole}
                onRefreshRoles={refreshRolePresets}
                onToggleStatusTag={toggleStatusTag}
                onClearStatusTags={clearStatusTags}
                onUpdateQualityNote={updateQualityNote}
                onUpdateActivity={updateActivity}
                onClearActivity={clearActivity}
                onScheduleFollowUp={scheduleFollowUp}
                onUpdateNotes={updateNotes}
                onNoteAdded={markAsNotNew}
                onUpdateDocuments={updateDocuments}
                onUpdatePosition={updatePosition}
                onUpdateAddress={updateAddress}
                onUpdatePhone={updatePhone}
                onUpdateDrivingLicense={updateDrivingLicense}
                onUpdateExperienceLevel={updateExperienceLevel}
                onClaim={claimCandidate}
                onUnclaim={unclaimCandidate}
                isMobile={true}
              />
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {menuOpen && (
            <div 
              className="fixed inset-0 z-50"
              onClick={() => setMenuOpen(false)}
            >
              <div 
                className="absolute right-4 top-20 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setImportOpen(true);
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-gray-700 active:bg-gray-50"
                >
                  Import CSV
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    refreshCandidates();
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-gray-700 active:bg-gray-50"
                >
                  Aktualisieren
                </button>
                {activeCandidate && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteConfirmOpen(true);
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-red-600 active:bg-red-50"
                  >
                    Kandidat löschen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modals */}
        <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Kandidat löschen</h3>
              <p className="text-sm text-gray-500 mt-1">
                Möchtest du <strong>{activeCandidate?.first_name} {activeCandidate?.last_name}</strong> wirklich löschen?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>
                Abbrechen
              </Button>
              <Button 
                onClick={handleDeleteCandidate}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? "Löschen..." : "Löschen"}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal open={importOpen} onClose={() => setImportOpen(false)}>
          <TmaImporter
            onImportComplete={() => {
              setImportOpen(false);
              refreshCandidates();
            }}
          />
        </Modal>

        <TmaCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreateCandidate={handleCreateCandidate}
          teams={teams}
          defaultTeamId={teamFilter ?? userTeamId ?? null}
        />
      </>
    );
  }

  // ==================== DESKTOP ====================
  return (
    <div className="flex h-full">
      <TmaList 
        candidates={candidates} 
        activeId={activeCandidate?.id ?? null} 
        onSelect={selectCandidate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <Button
              variant={statusFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              All ({allCandidates.length})
            </Button>
            <Button
              variant={statusFilter === "A" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("A")}
            >
              A ({countByStatus.A || 0})
            </Button>
            <Button
              variant={statusFilter === "B" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("B")}
            >
              B ({countByStatus.B || 0})
            </Button>
            <Button
              variant={statusFilter === "C" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("C")}
            >
              C ({countByStatus.C || 0})
            </Button>
            <div className="mx-2 h-4 w-px bg-gray-200" />
            <Button
              variant={activityFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActivityFilter("all")}
            >
              All activity
            </Button>
            <Button
              variant={activityFilter === "active" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActivityFilter("active")}
            >
              Active ({countByActivity.active})
            </Button>
            <Button
              variant={activityFilter === "inactive" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActivityFilter("inactive")}
            >
              Not active ({countByActivity.inactive})
            </Button>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <TmaLocationSearch
              onSearch={handleLocationSearch}
              onClear={clearLocationSearch}
              onRadiusChange={updateLocationRadius}
              isActive={locationSearch.active}
              isLoading={locationSearchLoading}
              currentLocation={locationSearch.location}
              currentRadius={locationSearch.radiusKm}
            />
            <div className="mx-1 h-4 w-px bg-gray-200" />
            <label className="flex items-center gap-2">
              <span className="text-gray-500">Canton</span>
              <select
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                value={cantonFilter ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) {
                    clearCantonFilter();
                  } else {
                    setCantonFilter(value);
                  }
                }}
              >
                <option value="">All</option>
                {availableCantons.map((canton) => (
                  <option key={canton} value={canton}>
                    {canton}
                  </option>
                ))}
              </select>
            </label>
            {cantonFilter && (
              <Button variant="ghost" size="sm" onClick={() => setCantonFilter(null)}>
                Clear
              </Button>
            )}
            <div className="mx-1 h-4 w-px bg-gray-200" />
            <label className="flex items-center gap-2">
              <span className="text-gray-500">Team</span>
              <select
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                value={teamFilter ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setTeamFilter(value || null);
                }}
              >
                <option value="">Alle Teams</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mx-1 h-4 w-px bg-gray-200" />
            <label className="flex items-center gap-2">
              <span className="text-gray-500">Berufserfahrung</span>
              <select
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                value={experienceFilter ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setExperienceFilter(value ? (value as ExperienceLevel) : null);
                }}
              >
                <option value="">Alle</option>
                <option value="less_than_1">{"< 1 Jahr"}</option>
                <option value="more_than_1">{"> 1 Jahr"}</option>
                <option value="more_than_3">{"> 3 Jahre"}</option>
              </select>
            </label>
            {experienceFilter && (
              <Button variant="ghost" size="sm" onClick={() => setExperienceFilter(null)}>
                Clear
              </Button>
            )}
            <label className="flex items-center gap-2">
              <span className="text-gray-500">Sort</span>
              <select
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                value={sortOption}
                onChange={(event) =>
                  setSortOption(event.target.value as "recent" | "oldest" | "name" | "activity" | "distance")
                }
              >
                <option value="recent">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
                <option value="activity">Activity</option>
                {locationSearch.active && <option value="distance">Distance</option>}
              </select>
            </label>
            {actionState.type && <span>{actionState.message}</span>}
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)} title="New Candidate">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </Button>
            <Button variant="ghost" size="sm" onClick={refreshCandidates}>
              Refresh
            </Button>
            <div className="relative">
              <Button variant="ghost" size="sm" onClick={() => setMenuOpen(!menuOpen)}>
                ⋯
              </Button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setImportOpen(true);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Import CSV
                  </button>
                  {activeCandidate && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteConfirmOpen(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete Candidate
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {error && <p className="px-6 py-2 text-xs text-red-500">{error}</p>}
        <div className="flex-1 overflow-y-auto">
          <TmaDetail
            key={`${activeCandidate?.id ?? "empty"}-${activeCandidate?.status_tags?.join(",") ?? ""}-${activeCandidate?.follow_up_at ?? ""}-${activeCandidate?.activity ?? ""}`}
            candidate={activeCandidate}
            roles={roles}
            rolesLoading={rolesLoading}
            onCreateRole={createRole}
            onUpdateRoleMetadata={updateRole}
            onDeleteRole={deleteRole}
            onRefreshRoles={refreshRolePresets}
            onToggleStatusTag={toggleStatusTag}
            onClearStatusTags={clearStatusTags}
            onUpdateQualityNote={updateQualityNote}
            onUpdateActivity={updateActivity}
            onClearActivity={clearActivity}
            onScheduleFollowUp={scheduleFollowUp}
            onUpdateNotes={updateNotes}
            onNoteAdded={markAsNotNew}
            onUpdateDocuments={updateDocuments}
            onUpdatePosition={updatePosition}
            onUpdateAddress={updateAddress}
            onUpdatePhone={updatePhone}
            onUpdateDrivingLicense={updateDrivingLicense}
            onUpdateExperienceLevel={updateExperienceLevel}
            onClaim={claimCandidate}
            onUnclaim={unclaimCandidate}
          />
        </div>
      </div>
      {/* Delete Confirmation Modal */}
      <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Delete Candidate</h3>
            <p className="text-sm text-gray-500 mt-1">
              Are you sure you want to delete <strong>{activeCandidate?.first_name} {activeCandidate?.last_name}</strong>? This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleDeleteCandidate}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)}>
        <TmaImporter
          onImportComplete={() => {
            setImportOpen(false);
            refreshCandidates();
          }}
        />
      </Modal>

      <TmaCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreateCandidate={handleCreateCandidate}
        teams={teams}
        defaultTeamId={teamFilter || userTeamId}
      />
    </div>
  );
}


