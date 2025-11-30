"use client";

import { useCallback, useMemo, useState } from "react";
import type { TmaCandidate } from "@/lib/types";
import type { TmaStatus } from "@/lib/utils/constants";

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

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (statusFilter !== "all" && candidate.status !== statusFilter) return false;
      if (cantonFilter && candidate.canton !== cantonFilter) return false;
      return true;
    });
  }, [candidates, cantonFilter, statusFilter]);

  const availableCantons = useMemo(() => {
    return Array.from(
      new Set(
        candidates
          .map((candidate) => candidate.canton)
          .filter((canton): canton is string => Boolean(canton))
      )
    ).sort();
  }, [candidates]);

  const activeCandidate = useMemo(() => {
    if (!activeId) return filteredCandidates[0] ?? null;
    return filteredCandidates.find((c) => c.id === activeId) ?? filteredCandidates[0] ?? null;
  }, [activeId, filteredCandidates]);

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
    async (payload: Partial<Pick<TmaCandidate, "cv_url" | "references_url">>) => {
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

  return {
    candidates: filteredCandidates,
    activeCandidate,
    actionState,
    error,
    cantonFilter,
    statusFilter,
    selectCandidate,
    refreshCandidates,
    updateStatus,
    scheduleFollowUp,
    updateNotes,
    updateDocuments,
    updatePosition,
    clearStatus,
    setCantonFilter,
    clearCantonFilter: () => setCantonFilter(null),
    setStatusFilter,
    availableCantons,
  };
}


