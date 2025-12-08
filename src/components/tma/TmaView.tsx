"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { TmaCandidate } from "@/lib/types";
import { useTmaCandidates } from "@/lib/hooks/useTmaCandidates";
import { TmaList } from "./TmaList";
import { TmaDetail } from "./TmaDetail";
import { TmaImporter } from "./TmaImporter";
import { TmaLocationSearch } from "./TmaLocationSearch";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface Props {
  initialCandidates: TmaCandidate[];
}

export function TmaView({ initialCandidates }: Props) {
  const searchParams = useSearchParams();
  const selectFromUrl = searchParams.get("select");

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
    updateDocuments,
    updatePosition,
    updateAddress,
    updatePhone,
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
  } = useTmaCandidates({ initialCandidates });
  const [importOpen, setImportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
              <Button variant="ghost" size="sm" onClick={clearCantonFilter}>
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
            key={activeCandidate?.id ?? "empty"}
            candidate={activeCandidate}
            roles={roles}
            rolesLoading={rolesLoading}
            onCreateRole={createRole}
            onUpdateRoleMetadata={updateRole}
            onDeleteRole={deleteRole}
            onRefreshRoles={refreshRolePresets}
            onToggleStatusTag={toggleStatusTag}
            onClearStatusTags={clearStatusTags}
            onUpdateActivity={updateActivity}
            onClearActivity={clearActivity}
            onScheduleFollowUp={scheduleFollowUp}
            onUpdateNotes={updateNotes}
            onUpdateDocuments={updateDocuments}
            onUpdatePosition={updatePosition}
            onUpdateAddress={updateAddress}
            onUpdatePhone={updatePhone}
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
    </div>
  );
}


