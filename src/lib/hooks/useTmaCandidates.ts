"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TmaCandidate, TmaRole } from "@/lib/types";
import type { TmaStatus, TmaActivity, DrivingLicense, ExperienceLevel } from "@/lib/utils/constants";
import { createClient } from "@/lib/supabase/client";
import { useTmaCacheOptional } from "@/lib/cache/TmaCacheContext";

interface UseTmaCandidatesOptions {
  initialCandidates?: TmaCandidate[];
  defaultTeamFilter?: string | null;
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

export function useTmaCandidates({ initialCandidates = [], defaultTeamFilter = null }: UseTmaCandidatesOptions) {
  // Get global cache if available
  const cache = useTmaCacheOptional();
  
  // Use cached candidates if available, otherwise fall back to initialCandidates
  const sourceCandidates = cache?.candidates.length ? cache.candidates : initialCandidates;
  
  const [candidates, setCandidates] = useState<TmaCandidate[]>(sourceCandidates);
  const [activeId, setActiveId] = useState<string | null>(sourceCandidates[0]?.id ?? null);
  const [actionState, setActionState] = useState<ActionState>({ type: null });
  const [error, setError] = useState<string | null>(null);
  const [cantonFilter, setCantonFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TmaStatus | "all">("all");
  const [activityFilter, setActivityFilter] = useState<TmaActivity | "all">("all");
  const [teamFilter, setTeamFilter] = useState<string | null>(defaultTeamFilter);
  const [experienceFilter, setExperienceFilter] = useState<ExperienceLevel | null>(null);
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

  // Track recent local updates to avoid realtime overwriting them
  const recentLocalUpdates = useRef<Set<string>>(new Set());
  
  // Sync local state with cache when cache updates (if not doing location search)
  useEffect(() => {
    if (cache && !locationSearch.active) {
      setCandidates(cache.candidates);
    }
  }, [cache?.candidates, cache, locationSearch.active]);

  // Real-time subscription - only if cache is NOT available (fallback mode)
  useEffect(() => {
    // Skip if we have global cache (it handles realtime) or doing location search
    if (cache || locationSearch.active) return;

    const supabase = createClient();

    const channel = supabase
      .channel("tma-candidates-realtime-fallback")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "tma_candidates",
        },
        async (payload) => {
          console.log("[TMA Realtime Fallback] Change received:", payload.eventType);

          if (payload.eventType === "INSERT") {
            // Fetch the full candidate with claimer info
            try {
              const res = await fetch(`/api/tma/${payload.new.id}`);
              if (res.ok) {
                const json = await res.json();
                if (json.data) {
                  setCandidates((prev) => [json.data, ...prev]);
                }
              }
            } catch {
              // Fallback: add without claimer info
              setCandidates((prev) => [payload.new as TmaCandidate, ...prev]);
            }
          } else if (payload.eventType === "UPDATE") {
            const candidateId = payload.new.id as string;
            
            // Skip if we just did a local update for this candidate (avoid overwriting)
            if (recentLocalUpdates.current.has(candidateId)) {
              console.log("[TMA Realtime] Skipping UPDATE - recent local update for:", candidateId);
              recentLocalUpdates.current.delete(candidateId);
              return;
            }
            
            // Use payload.new directly merged with existing data to preserve claimer info
                  setCandidates((prev) =>
              prev.map((c) => {
                if (c.id === candidateId) {
                  // Merge: keep existing claimer info, update everything else from realtime
                  return { ...c, ...payload.new, claimer: c.claimer } as TmaCandidate;
                }
                return c;
              })
              );
          } else if (payload.eventType === "DELETE") {
            setCandidates((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe((status) => {
        console.log("[TMA Realtime] Subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationSearch.active, cache]);
  
  // Helper to mark a candidate as recently updated locally
  const markLocalUpdate = useCallback((id: string) => {
    recentLocalUpdates.current.add(id);
    // Clear after 5 seconds to allow future realtime updates
    // Using longer timeout to ensure realtime doesn't overwrite during slow network
    setTimeout(() => {
      recentLocalUpdates.current.delete(id);
    }, 5000);
  }, []);

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
      if (teamFilter && candidate.team_id !== teamFilter) return false;
      if (experienceFilter && candidate.experience_level !== experienceFilter) return false;
      
      // Search filter - matches any part of name, email, phone, position, or canton
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const firstName = (candidate.first_name || "").toLowerCase();
        const lastName = (candidate.last_name || "").toLowerCase();
        const fullName = `${firstName} ${lastName}`;
        const reverseName = `${lastName} ${firstName}`;
        const email = (candidate.email || "").toLowerCase();
        const phone = (candidate.phone || "").toLowerCase();
        const position = (candidate.position_title || "").toLowerCase();
        const canton = (candidate.canton || "").toLowerCase();
        const city = (candidate.city || "").toLowerCase();
        
        const matches = 
          firstName.includes(query) ||
          lastName.includes(query) ||
          fullName.includes(query) ||
          reverseName.includes(query) ||
          email.includes(query) ||
          phone.includes(query) ||
          position.includes(query) ||
          canton.includes(query) ||
          city.includes(query);
        
        if (!matches) return false;
      }
      
      return true;
    });
  }, [candidates, cantonFilter, statusFilter, activityFilter, teamFilter, experienceFilter, searchQuery]);

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
        // Sort with NEW candidates first, then by date
        copy.sort((a, b) => {
          // NEW candidates (is_new = true AND no status) go first
          const aIsNew = a.is_new && (!a.status_tags || a.status_tags.length === 0);
          const bIsNew = b.is_new && (!b.status_tags || b.status_tags.length === 0);
          if (aIsNew && !bIsNew) return -1;
          if (!aIsNew && bIsNew) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
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
    // Use cache refresh if available
    if (cache) {
      await cache.refreshCache();
      return;
    }
    
    // Fallback to direct fetch
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
  }, [cache]);

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
    // Mark this as a local update to prevent realtime from overwriting
    markLocalUpdate(updated.id);
    setCandidates((prev) => prev.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
    // Also update the global cache if available
    if (cache) {
      cache.updateCandidate(updated.id, updated);
    }
  }, [markLocalUpdate, cache]);

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
        // Only send follow_up fields - DON'T overwrite status/status_tags!
        // Follow-up is a reminder, quality assessment is separate
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            follow_up_at: date.toISOString(),
            follow_up_note: note ?? null,
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

  const updateQualityNote = useCallback(
    async (quality_note: string | null) => {
      if (!activeCandidate) return;
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quality_note }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to save quality note");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save quality note");
      }
    },
    [activeCandidate, updateCandidateLocally]
  );

  const updateDocuments = useCallback(
    async (
      payload: Partial<Pick<TmaCandidate, "cv_url" | "references_url" | "short_profile_url" | "photo_url" | "ahv_url" | "id_url" | "bank_url">>
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

  const updateDrivingLicense = useCallback(
    async (drivingLicense: DrivingLicense | null) => {
      if (!activeCandidate) return;
      setActionState({ type: "saving", message: "Updating driving license..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driving_license: drivingLicense }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to update driving license");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update driving license");
      } finally {
        setActionState({ type: null });
      }
    },
    [activeCandidate, updateCandidateLocally]
  );

  const updateExperienceLevel = useCallback(
    async (experienceLevel: ExperienceLevel | null) => {
      if (!activeCandidate) return;
      setActionState({ type: "saving", message: "Updating experience level..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experience_level: experienceLevel }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to update experience level");
        updateCandidateLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update experience level");
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


  // Claim a TMA candidate
  const claimCandidate = useCallback(async () => {
    if (!activeCandidate) return;
    setActionState({ type: "saving", message: "Claiming candidate..." });
    try {
      const response = await fetch(`/api/tma/${activeCandidate.id}/claim`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to claim");
      updateCandidateLocally(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim candidate");
    } finally {
      setActionState({ type: null });
    }
  }, [activeCandidate, updateCandidateLocally]);

  // Unclaim a TMA candidate
  const unclaimCandidate = useCallback(async () => {
    if (!activeCandidate) return;
    setActionState({ type: "saving", message: "Unclaiming candidate..." });
    try {
      const response = await fetch(`/api/tma/${activeCandidate.id}/claim`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to unclaim");
      updateCandidateLocally(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unclaim candidate");
    } finally {
      setActionState({ type: null });
    }
  }, [activeCandidate, updateCandidateLocally]);

  // Mark active candidate as no longer "NEW" (called when a note is added)
  const markAsNotNew = useCallback(() => {
    if (!activeCandidate || !activeCandidate.is_new) return;
    updateCandidateLocally({
      ...activeCandidate,
      is_new: false,
    });
  }, [activeCandidate, updateCandidateLocally]);

  // Create a new TMA candidate
  const createCandidate = useCallback(
    async (payload: {
      first_name: string;
      last_name: string;
      email?: string | null;
      phone?: string | null;
      team_id?: string | null;
    }) => {
      setActionState({ type: "saving", message: "Creating candidate..." });
      try {
        const response = await fetch("/api/tma", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to create candidate");
        }
        const newCandidate = json.data as TmaCandidate;
        
        // Add to local state
        setCandidates((prev) => [newCandidate, ...prev]);
        
        // Also add to global cache if available
        if (cache) {
          cache.addCandidate(newCandidate);
        }
        
        // Select the new candidate
        setActiveId(newCandidate.id);
        
        return newCandidate;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create candidate";
        setError(message);
        throw err;
      } finally {
        setActionState({ type: null });
      }
    },
    [cache]
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
    teamFilter,
    setTeamFilter,
    experienceFilter,
    setExperienceFilter,
    searchQuery,
    selectCandidate,
    refreshCandidates,
    createCandidate,
    toggleStatusTag,
    clearStatusTags,
    updateActivity,
    scheduleFollowUp,
    updateNotes,
    updateQualityNote,
    updateDocuments,
    markAsNotNew,
    updatePosition,
    updateAddress,
    updatePhone,
    updateDrivingLicense,
    updateExperienceLevel,
    clearActivity,
    claimCandidate,
    unclaimCandidate,
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
