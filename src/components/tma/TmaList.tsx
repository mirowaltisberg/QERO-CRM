"use client";

import { memo } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { TmaCandidate } from "@/lib/types";
import { CantonTag } from "@/components/ui/CantonTag";
import { 
  TMA_STATUS_STYLES, 
  TMA_ACTIVITY_STYLES,
  type TmaStatus,
  type TmaActivity
} from "@/lib/utils/constants";

interface Props {
  candidates: TmaCandidate[];
  activeId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isMobile?: boolean;
}

export const TmaList = memo(function TmaList({ 
  candidates, 
  activeId, 
  onSelect,
  searchQuery,
  onSearchChange,
  isMobile = false,
}: Props) {
  const t = useTranslations("tma");
  const tActivity = useTranslations("activity");
  return (
    <aside className={`flex h-full flex-col border-r border-gray-200 bg-gray-50 ${isMobile ? "w-full" : "w-80"}`}>
      {/* Header hidden on mobile (shown in TmaView) */}
      {!isMobile && (
        <header className="border-b border-gray-200 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">TMA</p>
          <p className="text-sm font-semibold text-gray-900">{candidates.length} {t("candidates")}</p>
          <div className="mt-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("searchCandidates")}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0"
            />
          </div>
        </header>
      )}
      {/* Mobile search */}
      {isMobile && (
        <div className="px-4 py-2 bg-gray-50">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Kandidat suchen..."
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {candidates.map((candidate) => {
          const isActive = candidate.id === activeId;
          const statusTags =
            candidate.status_tags && candidate.status_tags.length > 0
              ? candidate.status_tags
              : candidate.status
              ? [candidate.status]
              : [];
          return (
            <button
              type="button"
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
                <div className="flex flex-wrap gap-1 justify-end">
                  {statusTags.length > 0 ? (
                    statusTags.map((tag) => (
                      <span
                        key={`${candidate.id}-${tag}`}
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          backgroundColor: `${TMA_STATUS_STYLES[tag as TmaStatus].bg}20`,
                          color: TMA_STATUS_STYLES[tag as TmaStatus].text,
                          borderColor: `${TMA_STATUS_STYLES[tag as TmaStatus].border}40`,
                        }}
                      >
                        {tag}
                      </span>
                    ))
                  ) : candidate.is_new ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-600 animate-shine">
                      NEW
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">Set status</span>
                  )}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500 gap-2">
                <div className="flex flex-col gap-1 truncate">
                  <p className="truncate text-gray-600">
                    {candidate.position_title?.trim() ||
                      candidate.email ||
                      "No details"}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    {candidate.city && (
                      <span className="font-medium text-gray-700 truncate">
                        {candidate.postal_code ? `${candidate.postal_code} ${candidate.city}` : candidate.city}
                      </span>
                    )}
                    {candidate.distance_km !== undefined && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {candidate.distance_km} km
                      </span>
                    )}
                    {candidate.activity && (
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          backgroundColor: `${TMA_ACTIVITY_STYLES[candidate.activity as TmaActivity].bg}20`,
                          color: TMA_ACTIVITY_STYLES[candidate.activity as TmaActivity].text,
                          borderColor: `${TMA_ACTIVITY_STYLES[candidate.activity as TmaActivity].border}40`,
                        }}
                      >
                        {tActivity(candidate.activity as TmaActivity)}
                      </span>
                    )}
                  </div>
                </div>
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


