"use client";

import { memo } from "react";
import Image from "next/image";
import type { TmaCandidate } from "@/lib/types";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import { TMA_STATUS_LABELS, TMA_STATUS_STYLES, type TmaStatus } from "@/lib/utils/constants";

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
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {candidate.claimer ? (
                    <div className="h-6 w-6 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
                      {candidate.claimer.avatar_url ? (
                        <Image
                          src={candidate.claimer.avatar_url}
                          alt={candidate.claimer.full_name || "Claimer"}
                          width={24}
                          height={24}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-gray-500">
                          {candidate.claimer.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "??"}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-6 w-6 flex-shrink-0 rounded-full border-2 border-dashed border-orange-300 bg-orange-50" title="Unclaimed" />
                  )}
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {candidate.first_name} {candidate.last_name}
                  </p>
                </div>
                <Tag
                  status={undefined}
                  className="bg-gray-100 text-gray-500 border-gray-200 flex-shrink-0"
                  style={
                    candidate.status
                      ? {
                          backgroundColor: `${TMA_STATUS_STYLES[candidate.status as TmaStatus].bg}20`,
                          color: TMA_STATUS_STYLES[candidate.status as TmaStatus].text,
                          borderColor: `${TMA_STATUS_STYLES[candidate.status as TmaStatus].border}50`,
                        }
                      : undefined
                  }
                >
                  {candidate.status ? TMA_STATUS_LABELS[candidate.status as TmaStatus] : "Set status"}
                </Tag>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500 gap-2">
                <p className="truncate">
                  {candidate.position_title?.trim() ||
                    candidate.email ||
                    "No details"}
                </p>
                <CantonTag canton={candidate.canton} size="md" />
              </div>
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


