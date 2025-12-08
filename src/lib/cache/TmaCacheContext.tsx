"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TmaCandidate } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface TmaCacheState {
  candidates: TmaCandidate[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  isStale: boolean;
}

interface TmaCacheContextValue extends TmaCacheState {
  refreshCache: () => Promise<void>;
  updateCandidate: (id: string, updates: Partial<TmaCandidate>) => void;
  removeCandidate: (id: string) => void;
  addCandidate: (candidate: TmaCandidate) => void;
  getCandidateById: (id: string) => TmaCandidate | undefined;
}

const TmaCacheContext = createContext<TmaCacheContextValue | null>(null);

// Cache is considered stale after 5 minutes
const STALE_TIME_MS = 5 * 60 * 1000;

export function TmaCacheProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TmaCacheState>({
    candidates: [],
    loading: true,
    error: null,
    lastFetched: null,
    isStale: false,
  });

  const supabase = useRef(createClient());
  const recentLocalUpdates = useRef<Set<string>>(new Set());
  const isMounted = useRef(true);

  // Mark a candidate as recently updated locally (to avoid realtime overwrite)
  const markLocalUpdate = useCallback((id: string) => {
    recentLocalUpdates.current.add(id);
    setTimeout(() => {
      recentLocalUpdates.current.delete(id);
    }, 5000); // 5 second window
  }, []);

  // Fetch all TMA candidates
  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch("/api/tma", {
        cache: "no-store",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch TMA candidates: ${res.status}`);
      }

      const json = await res.json();
      const candidates = json.data || [];

      if (isMounted.current) {
        setState({
          candidates,
          loading: false,
          error: null,
          lastFetched: Date.now(),
          isStale: false,
        });
      }
    } catch (err) {
      console.error("[TmaCache] Fetch error:", err);
      if (isMounted.current) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load TMA data",
        }));
      }
    }
  }, []);

  // Refresh cache
  const refreshCache = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    await fetchCandidates();
  }, [fetchCandidates]);

  // Update a single candidate in cache
  const updateCandidate = useCallback((id: string, updates: Partial<TmaCandidate>) => {
    markLocalUpdate(id);
    setState((prev) => ({
      ...prev,
      candidates: prev.candidates.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  }, [markLocalUpdate]);

  // Remove candidate from cache
  const removeCandidate = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      candidates: prev.candidates.filter((c) => c.id !== id),
    }));
  }, []);

  // Add candidate to cache
  const addCandidate = useCallback((candidate: TmaCandidate) => {
    setState((prev) => ({
      ...prev,
      candidates: [candidate, ...prev.candidates],
    }));
  }, []);

  // Get candidate by ID
  const getCandidateById = useCallback(
    (id: string) => state.candidates.find((c) => c.id === id),
    [state.candidates]
  );

  // Initial fetch on mount
  useEffect(() => {
    isMounted.current = true;
    fetchCandidates();

    return () => {
      isMounted.current = false;
    };
  }, [fetchCandidates]);

  // Global realtime subscription
  useEffect(() => {
    const channel = supabase.current
      .channel("tma-global-cache")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tma_candidates",
        },
        async (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === "INSERT") {
            // Fetch the full candidate with claimer info
            const { data } = await supabase.current
              .from("tma_candidates")
              .select(`*, claimer:profiles!claimed_by(id, full_name, avatar_url)`)
              .eq("id", (newRecord as { id: string }).id)
              .single();

            if (data && isMounted.current) {
              setState((prev) => {
                // Avoid duplicates
                if (prev.candidates.some((c) => c.id === data.id)) {
                  return prev;
                }
                return {
                  ...prev,
                  candidates: [data, ...prev.candidates],
                };
              });
            }
          } else if (eventType === "UPDATE") {
            const candidateId = (newRecord as { id: string }).id;

            // Skip if this was a local update (avoid race condition)
            if (recentLocalUpdates.current.has(candidateId)) {
              return;
            }

            // Fetch updated candidate with claimer info
            const { data } = await supabase.current
              .from("tma_candidates")
              .select(`*, claimer:profiles!claimed_by(id, full_name, avatar_url)`)
              .eq("id", candidateId)
              .single();

            if (data && isMounted.current) {
              setState((prev) => ({
                ...prev,
                candidates: prev.candidates.map((c) =>
                  c.id === candidateId ? { ...c, ...data } : c
                ),
              }));
            }
          } else if (eventType === "DELETE") {
            const candidateId = (oldRecord as { id: string }).id;
            if (isMounted.current) {
              setState((prev) => ({
                ...prev,
                candidates: prev.candidates.filter((c) => c.id !== candidateId),
              }));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.current.removeChannel(channel);
    };
  }, []);

  // Check for staleness periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.lastFetched) {
        const isStale = Date.now() - state.lastFetched > STALE_TIME_MS;
        if (isStale !== state.isStale) {
          setState((prev) => ({ ...prev, isStale }));
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [state.lastFetched, state.isStale]);

  // Refresh on tab focus if stale
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && state.isStale) {
        refreshCache();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [state.isStale, refreshCache]);

  const value: TmaCacheContextValue = {
    ...state,
    refreshCache,
    updateCandidate,
    removeCandidate,
    addCandidate,
    getCandidateById,
  };

  return (
    <TmaCacheContext.Provider value={value}>
      {children}
    </TmaCacheContext.Provider>
  );
}

export function useTmaCache() {
  const context = useContext(TmaCacheContext);
  if (!context) {
    throw new Error("useTmaCache must be used within TmaCacheProvider");
  }
  return context;
}

// Hook for components that need optional access (won't throw if outside provider)
export function useTmaCacheOptional() {
  return useContext(TmaCacheContext);
}
