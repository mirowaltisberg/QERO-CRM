"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TmaCandidate } from "@/lib/types";
import type { TmaStatus, TmaActivity } from "@/lib/utils/constants";

interface UseTmaCandidatesOptions {
  initialCandidates?: TmaCandidate[];
}

interface ActionState {
  type: "saving" | null;
  message?: string;
}

export function useTmaCandidates({ initialCandidates = [] }: UseTmaCandidatesOptions) {
  const [candidates, setCandidates] = useState<TmaCandidate[]>(initialCandidates);
  const [activeId, setActiveId] = useState<string | null>(initialCandidates[0]?.id ?? null);
  const [actionState, setActionState] = useState<ActionState>({ type: null });
  const [error, setError] = useState<string | null>(null);
  const [cantonFilter, setCantonFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TmaStatus | "all">("all");
  const [sortOption, setSortOption] = useState<"recent" | "oldest" | "name">("recent");
  const [searchQuery, setSearchQuery] = useState("");

  // Auto-refresh every 5 seconds to keep data in sync across users
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch("/api/tma");
        const json = await response.json();
        if (response.ok && json.data) {
          setCandidates(json.data);
        }
      } catch (err) {
        // Silently fail - will retry on next interval
      }
    }, 5000); // 5 seconds

    return () => {
      clearInterval(pollInterval);
    };
  }, []);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (statusFilter !== "all" && candidate.status !== statusFilter) return false;
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
  }, [candidates, cantonFilter, statusFilter, searchQuery]);

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

  const updateCandidateLocally = useCallback((updated: TmaCandidate) => {
    setCandidates((prev) => prev.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
  }, []);

  const updateStatus = useCallback(
    async (status: TmaStatus) => {
      if (!activeCandidate || activeCandidate.status === status) return;
      setActionState({ type: "saving", message: "Updating status..." });
      try {
        const response = await fetch(`/api/tma/${activeCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
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

  const clearStatus = useCallback(async () => {
    if (!activeCandidate || activeCandidate.status === null) return;
    setActionState({ type: "saving", message: "Clearing status..." });
    try {
      const response = await fetch(`/api/tma/${activeCandidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: null }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to clear status");
      updateCandidateLocally(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear status");
    } finally {
      setActionState({ type: null });
    }
  }, [activeCandidate, updateCandidateLocally]);

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

  return {
    candidates: sortedCandidates,
    activeCandidate,
    actionState,
    error,
    cantonFilter,
    statusFilter,
    searchQuery,
    selectCandidate,
    refreshCandidates,
    updateStatus,
    updateActivity,
    scheduleFollowUp,
    updateNotes,
    updateDocuments,
    updatePosition,
    clearStatus,
    clearActivity,
    setCantonFilter,
    clearCantonFilter: () => setCantonFilter(null),
    setStatusFilter,
    setSearchQuery,
    availableCantons,
    sortOption,
    setSortOption,
  };
}


