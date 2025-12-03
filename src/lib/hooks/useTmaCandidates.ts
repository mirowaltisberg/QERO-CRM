"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TmaCandidate, TmaRole } from "@/lib/types";
import type { TmaStatus, TmaActivity } from "@/lib/utils/constants";

interface UseTmaCandidatesOptions {
  initialCandidates?: TmaCandidate[];
}

interface ActionState {
  type: "saving" | null;
  message?: string;
}

interface LocationSearchState {
  query: string;
  radiusKm: number;
  active: boolean;
  location: {
    name: string;
    plz: string;
    lat: number;
    lng: number;
  } | null;
}

const STATUS_ORDER: TmaStatus[] = ["A", "B", "C"];

function normalizeStatusTags(tags?: TmaStatus[] | null, fallback?: TmaStatus | null) {
  if (tags && tags.length > 0) {
    return sortStatusTags(tags);
  }
  if (fallback) return [fallback];
  return [];
}

function sortStatusTags(tags: TmaStatus[]) {
  return [...tags].sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
}

function getCandidateStatusTags(candidate: TmaCandidate | null) {
  if (!candidate) return [];
  return normalizeStatusTags(candidate.status_tags, candidate.status ?? null);
}

export function useTmaCandidates({ initialCandidates = [] }: UseTmaCandidatesOptions) {
  const [candidates, setCandidates] = useState<TmaCandidate[]>(initialCandidates);
  const [activeId, setActiveId] = useState<string | null>(initialCandidates[0]?.id ?? null);
  const [actionState, setActionState] = useState<ActionState>({ type: null });
  const [error, setError] = useState<string | null>(null);
  const [cantonFilter, setCantonFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TmaStatus | "all">("all");
  const [activityFilter, setActivityFilter] = useState<TmaActivity | "all">("all");
  const [sortOption, setSortOption] = useState<"recent" | "oldest" | "name" | "activity" | "distance">("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [locationSearch, setLocationSearch] = useState<LocationSearchState>({
    query: "",
    radiusKm: 25,
    active: false,
    location: null,
  });
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [roles, setRoles] = useState<TmaRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Auto-refresh every 5 seconds to keep data in sync across users
  useEffect(() => {
    if (locationSearch.active) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch("/api/tma");
        const json = await response.json();
        if (response.ok && json.data) {
          setCandidates(json.data);
        }
      } catch {
        // Silently fail - will retry on next interval
      }
    }, 5000); // 5 seconds

    return () => {
      clearInterval(pollInterval);
    };
  }, [locationSearch.active]);

  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const response = await fetch("/api/tma/roles");
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to load roles");
      }
      setRoles(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles");
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (statusFilter !== "all") {
        const tags = getCandidateStatusTags(candidate);
        if (!tags.includes(statusFilter)) return false;
      }
      if (activityFilter !== "all" && candidate.activity !== activityFilter) return false;
      if (cantonFilter && candidate.canton !== cantonFilter) return false;
      
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchableFields = [
          candidate.first_name,
          candidate.last_name,
          candidate.email,
          candidate.phone,
          candidate.position_title,
          candidate.canton,
        ].filter(Boolean).join(" ").toLowerCase();
        
        if (!searchableFields.includes(query)) return false;
      }
      
      return true;
    });
  }, [candidates, cantonFilter, statusFilter, activityFilter, searchQuery]);

  const availableCantons = useMemo(() => {
    return Array.from(
      new Set(
        candidates
          .map((candidate) => candidate.canton)
          .filter((canton): canton is string => Boolean(canton))
      )
    ).sort();
  }, [candidates]);

  const sortedCandidates = useMemo(() => {
    const copy = [...filteredCandidates];
    switch (sortOption) {
      case "oldest":
        copy.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case "name":
        copy.sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
        );
        break;
      case "activity":
        copy.sort((a, b) => {
          const aScore = a.activity === "active" ? 0 : 1;
          const bScore = b.activity === "active" ? 0 : 1;
          if (aScore !== bScore) return aScore - bScore;
          return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
        });
        break;
      case "distance":
        // Sort by distance (only meaningful when location search is active)
        copy.sort((a, b) => {
          const aDist = a.distance_km ?? Infinity;
          const bDist = b.distance_km ?? Infinity;
          return aDist - bDist;
        });
        break;
      default:
        copy.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
    return copy;
  }, [filteredCandidates, sortOption]);

  const activeCandidate = useMemo(() => {
    if (!activeId) return sortedCandidates[0] ?? null;
    return sortedCandidates.find((c) => c.id === activeId) ?? sortedCandidates[0] ?? null;
  }, [activeId, sortedCandidates]);

  const selectCandidate = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const refreshCandidates = useCallback(async () => {
    try {
      const response = await fetch("/api/tma");
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to load candidates");
      }
      setCandidates(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh candidates");
    }
  }, []);

  const createRole = useCallback(
    async (payload: { name: string; color: string; note?: string | null }) => {
      try {
        const response = await fetch("/api/tma/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to create role");
        }
        const newRole = json.data as TmaRole;
        setRoles((prev) => [...prev, newRole].sort((a, b) => a.name.localeCompare(b.name)));
        return newRole;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create role";
        setError(message);
        throw err;
      }
    },
    []
  );

  const updateRole = useCallback(
    async (roleId: string, payload: Partial<Pick<TmaRole, "name" | "color" | "note">>) => {
      try {
        const response = await fetch(`/api/tma/roles/${roleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to update role");
        }
        const updated = json.data as TmaRole;
        setRoles((prev) =>
          prev
            .map((role) => (role.id === roleId ? updated : role))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update role";
        setError(message);
        throw err;
      }
    },
    []
  );

  const deleteRole = useCallback(
    async (roleId: string) => {
      try {
        const response = await fetch(`/api/tma/roles/${roleId}`, {
          method: "DELETE",
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to delete role");
        }
        setRoles((prev) => prev.filter((role) => role.id !== roleId));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete role";
        setError(message);
        throw err;
      }
    },
    []
  );

  const updateCandidateLocally = useCallback((updated: TmaCandidate) => {
    setCandidates((prev) => prev.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
  }, []);

  const setStatusTags = useCallback(
    async (statusTags: TmaStatus[]) => {
      if (!activeCandidate) return;
      const normalizedTags = sortStatusTags(statusTags);
      if (
        JSON.stringify(normalizedTags) ===
        JSON.stringify(getCandidateStatusTags(activeCandidate))
      ) {
        return;
      }
      setActionState({ type: "saving", message: "Updating quality tags..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status_tags: normalizedTags,
            status: normalizedTags[0] ?? null,
          }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to update status");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update status");
      } finally {
        setActionState({ type: null });
      }
    },
    [activeCandidate, updateCandidateLocally]
  );

  const toggleStatusTag = useCallback(
    async (status: TmaStatus) => {
      if (!activeCandidate) return;
      const currentTags = getCandidateStatusTags(activeCandidate);
      const hasTag = currentTags.includes(status);
      const nextTags = hasTag
        ? currentTags.filter((tag) => tag !== status)
        : sortStatusTags([...currentTags, status]);
      await setStatusTags(nextTags);
    },
    [activeCandidate, setStatusTags]
  );

  const scheduleFollowUp = useCallback(
    async ({ date, note }: { date: Date; note?: string }) => {
      if (!activeCandidate) return;
      setActionState({ type: "saving", message: "Scheduling follow-up..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            follow_up_at: date.toISOString(),
            follow_up_note: note ?? null,
            status: "C",
            status_tags: ["C"],
          }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to schedule follow-up");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to schedule follow-up");
      } finally {
        setActionState({ type: null });
      }
    },
    [activeCandidate, updateCandidateLocally]
  );

  const updateNotes = useCallback(
    async (notes: string | null) => {
      if (!activeCandidate) return;
      setActionState({ type: "saving", message: "Saving notes..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to save notes");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save notes");
        throw err;
      } finally {
        setActionState({ type: null });
      }
    },
    [activeCandidate, updateCandidateLocally]
  );

  const updateDocuments = useCallback(
    async (
      payload: Partial<Pick<TmaCandidate, "cv_url" | "references_url" | "short_profile_url">>
    ) => {
      if (!activeCandidate) return;
      const response = await fetch(`/api/tma/${activeCandidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to update documents");
      updateCandidateLocally(json.data);
    },
    [activeCandidate, updateCandidateLocally]
  );

  const updatePosition = useCallback(
    async (position_title: string | null) => {
      if (!activeCandidate) return;
      setActionState({ type: "saving", message: "Updating position..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position_title }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to update position");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update position");
      } finally {
        setActionState({ type: null });
      }
    },
    [activeCandidate, updateCandidateLocally]
  );

  const clearStatusTags = useCallback(async () => {
    await setStatusTags([]);
  }, [setStatusTags]);

  const updateAddress = useCallback(
    async (payload: { city: string | null; street: string | null; postal_code: string | null }) => {
      if (!activeCandidate) return;
      setActionState({ type: "saving", message: "Updating address..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to update address");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update address");
      } finally {
        setActionState({ type: null });
      }
    },
    [activeCandidate, updateCandidateLocally]
  );

  const updatePhone = useCallback(
    async (phone: string | null) => {
      if (!activeCandidate) return;
      setActionState({ type: "saving", message: "Updating phone..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to update phone");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update phone");
      } finally {
        setActionState({ type: null });
      }
    },
    [activeCandidate, updateCandidateLocally]
  );

  const updateActivity = useCallback(
    async (activity: TmaActivity) => {
      if (!activeCandidate || activeCandidate.activity === activity) return;
      setActionState({ type: "saving", message: "Updating activity..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to update activity");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update activity");
      } finally {
        setActionState({ type: null });
      }
    },
    [activeCandidate, updateCandidateLocally]
  );

  const clearActivity = useCallback(async () => {
    if (!activeCandidate || activeCandidate.activity === null) return;
    setActionState({ type: "saving", message: "Clearing activity..." });
    try {
      const response = await fetch(`/api/tma/${activeCandidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity: null }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to clear activity");
      updateCandidateLocally(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear activity");
    } finally {
      setActionState({ type: null });
    }
  }, [activeCandidate, updateCandidateLocally]);

  // Location-based search
  const searchByLocation = useCallback(
    async (query: string, radiusKm: number) => {
      if (!query.trim()) {
        // Clear location search
        setLocationSearch({
          query: "",
          radiusKm: 25,
          active: false,
          location: null,
        });
        // Refresh to get all candidates
        await refreshCandidates();
        return;
      }

      setLocationSearchLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          location: query,
          radius: radiusKm.toString(),
        });

        // Add current filters
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (activityFilter !== "all") params.set("activity", activityFilter);
        if (cantonFilter) params.set("canton", cantonFilter);

        const response = await fetch(`/api/tma/search?${params}`);
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error || "Location search failed");
        }

        setCandidates(json.data.candidates);
        setLocationSearch({
          query,
          radiusKm,
          active: true,
          location: json.data.location,
        });
        
        // Auto-sort by distance when location search is active
        setSortOption("distance");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Location search failed");
      } finally {
        setLocationSearchLoading(false);
      }
    },
    [statusFilter, activityFilter, cantonFilter, refreshCandidates]
  );

  const clearLocationSearch = useCallback(async () => {
    setLocationSearch({
      query: "",
      radiusKm: 25,
      active: false,
      location: null,
    });
    setSortOption("recent");
    await refreshCandidates();
  }, [refreshCandidates]);

  const updateLocationRadius = useCallback(
    async (radiusKm: number) => {
      if (!locationSearch.active || !locationSearch.query) return;
      await searchByLocation(locationSearch.query, radiusKm);
    },
    [locationSearch.active, locationSearch.query, searchByLocation]
  );

  return {
    candidates: sortedCandidates,
    allCandidates: candidates,
    activeCandidate,
    actionState,
    error,
    cantonFilter,
    statusFilter,
    activityFilter,
    searchQuery,
    selectCandidate,
    refreshCandidates,
    toggleStatusTag,
    clearStatusTags,
    updateActivity,
    scheduleFollowUp,
    updateNotes,
    updateDocuments,
    updatePosition,
    updateAddress,
    updatePhone,
    clearActivity,
    setCantonFilter,
    clearCantonFilter: () => setCantonFilter(null),
    setStatusFilter,
    setActivityFilter,
    setSearchQuery,
    availableCantons,
    roles,
    rolesLoading,
    createRole,
    updateRole,
    deleteRole,
    refreshRoles: fetchRoles,
    sortOption,
    setSortOption,
    // Location search
    locationSearch,
    locationSearchLoading,
    searchByLocation,
    clearLocationSearch,
    updateLocationRadius,
  };
}


