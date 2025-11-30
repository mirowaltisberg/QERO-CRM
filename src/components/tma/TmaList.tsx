"use client";

import { memo } from "react";
import type { TmaCandidate } from "@/lib/types";
import { Tag } from "@/components/ui/tag";
import { TMA_STATUS_COLORS, TMA_STATUS_LABELS } from "@/lib/utils/constants";

interface Props {
  candidates: TmaCandidate[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export const TmaList = memo(function TmaList({ candidates, activeId, onSelect }: Props) {
  return (
    <aside className="flex h-full w-80 flex-col border-r border-gray-200 bg-gray-50">
      <header className="border-b border-gray-200 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-gray-400">TMA</p>
        <p className="text-sm font-semibold text-gray-900">{candidates.length} candidates</p>
      </header>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {candidates.map((candidate) => {
          const isActive = candidate.id === activeId;
          return (
            <button
              key={candidate.id}
              onClick={() => onSelect(candidate.id)}
              className={[
                "w-full rounded-2xl border px-3 py-2 text-left transition",
                isActive ? "border-gray-200 bg-white shadow" : "border-transparent bg-white/70 hover:border-gray-200",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {candidate.first_name} {candidate.last_name}
                </p>
                <Tag
                  className={TMA_STATUS_COLORS[candidate.status]}
                >
                  {TMA_STATUS_LABELS[candidate.status]}
                </Tag>
              </div>
              <p className="text-xs text-gray-500">
                {candidate.email ?? "No email"} {candidate.canton && `• ${candidate.canton}`}
              </p>
              {candidate.follow_up_at && (
                <p className="text-xs text-amber-600">Follow-up {new Date(candidate.follow_up_at).toLocaleDateString()}</p>
              )}
            </button>
          );
        })}
        {candidates.length === 0 && <p className="text-center text-xs text-gray-500">No candidates yet.</p>}
      </div>
    </aside>
  );
});

