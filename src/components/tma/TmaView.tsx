"use client";

import { useMemo } from "react";
import type { TmaCandidate } from "@/lib/types";
import { useTmaCandidates } from "@/lib/hooks/useTmaCandidates";
import { TmaList } from "./TmaList";
import { TmaDetail } from "./TmaDetail";
import { TmaImporter } from "./TmaImporter";
import { Button } from "@/components/ui/button";

interface Props {
  initialCandidates: TmaCandidate[];
}

export function TmaView({ initialCandidates }: Props) {
  const {
    candidates,
    activeCandidate,
    actionState,
    error,
    selectCandidate,
    refreshCandidates,
    updateStatus,
    scheduleFollowUp,
    updateNotes,
    updateDocuments,
    clearStatus,
    setStatusFilter,
    statusFilter,
    setCantonFilter,
    clearCantonFilter,
    availableCantons,
    cantonFilter,
  } = useTmaCandidates({ initialCandidates });

  const countByStatus = useMemo(() => {
    return candidates.reduce(
      (acc, candidate) => {
        if (candidate.status && acc[candidate.status] !== undefined) {
          acc[candidate.status] += 1;
        }
        return acc;
      },
      { A: 0, B: 0, C: 0 }
    );
  }, [candidates]);

  return (
    <div className="flex h-full">
      <TmaList candidates={candidates} activeId={activeCandidate?.id ?? null} onSelect={selectCandidate} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <Button
              variant={statusFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              All ({candidates.length})
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
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
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
            {actionState.type && <span>{actionState.message}</span>}
            <Button variant="ghost" size="sm" onClick={refreshCandidates}>
              Refresh
            </Button>
          </div>
        </div>
        {error && <p className="px-6 py-2 text-xs text-red-500">{error}</p>}
        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-4 p-6 lg:grid-cols-[2fr_1fr]">
            <TmaDetail
              key={activeCandidate?.id ?? "empty"}
              candidate={activeCandidate}
              onUpdateStatus={updateStatus}
              onClearStatus={clearStatus}
              onScheduleFollowUp={scheduleFollowUp}
              onUpdateNotes={updateNotes}
              onUpdateDocuments={updateDocuments}
            />
            <div className="flex flex-col items-end">
              <TmaImporter onImportComplete={refreshCandidates} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


