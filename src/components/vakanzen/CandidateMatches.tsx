"use client";

import { memo, useState } from "react";
import { useTranslations } from "next-intl";
import type { Vacancy, VacancyCandidate, TmaCandidate } from "@/lib/types";
import { VACANCY_CANDIDATE_STATUS_LIST, VACANCY_CANDIDATE_STATUS_LABELS, VACANCY_CANDIDATE_STATUS_COLORS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { DrivingLicenseBadge } from "@/components/ui/DrivingLicenseBadge";

interface ScoreBreakdown {
  base: number;
  location: number;
  closeness: number;
  quality: number;
  qualityPenalty: number;
  activity: number;
  role: number;
  total: number;
}

interface CandidateData {
  assigned: VacancyCandidate[];
  suggested: (TmaCandidate & { distance_km: number; match_score: number; score_breakdown?: ScoreBreakdown })[];
}

interface Props {
  vacancy: Vacancy;
  candidates: CandidateData | null;
  loading: boolean;
  onAddCandidate: (tmaId: string) => void;
  onUpdateStatus: (tmaId: string, status: string) => void;
  onRemove: (tmaId: string) => void;
  onBack?: () => void;
  isMobile?: boolean;
}

const QualityBadge = ({ tags, status }: { tags: string[] | null; status?: string | null }) => {
  // Use status_tags if populated, otherwise fallback to legacy status field
  const qualities = (tags && tags.length > 0) ? tags : (status ? [status] : []);
  if (qualities.length === 0) return null;
  const best = qualities.includes("A") ? "A" : qualities.includes("B") ? "B" : "C";
  return (
    <span className={cn(
      "rounded px-1.5 py-0.5 text-[10px] font-bold",
      best === "A" ? "bg-green-100 text-green-700" :
      best === "B" ? "bg-amber-100 text-amber-700" :
      "bg-red-100 text-red-700"
    )}>
      {best}
    </span>
  );
};

const ScoreBreakdownPopup = ({ breakdown, onClose }: { breakdown: ScoreBreakdown; onClose: () => void }) => {
  const items = [
    { label: "Basis", value: breakdown.base, color: "text-gray-500" },
    { label: "Standort", value: breakdown.location, color: breakdown.location >= 0 ? "text-green-600" : "text-red-500" },
    { label: "Nähe-Bonus", value: breakdown.closeness, color: "text-green-600", show: breakdown.closeness > 0 },
    { label: "Qualität", value: breakdown.quality, color: "text-blue-600", show: breakdown.quality > 0 },
    { label: "Qualität unter Min.", value: breakdown.qualityPenalty, color: "text-red-500", show: breakdown.qualityPenalty !== 0 },
    { label: "Aktiv", value: breakdown.activity, color: "text-green-600", show: breakdown.activity > 0 },
    { label: "Rolle passt", value: breakdown.role, color: "text-purple-600", show: breakdown.role > 0 },
  ].filter(item => item.show !== false);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
        <div className="text-xs font-medium text-gray-700 mb-2">{useTranslations("tma")("scoreBreakdown")}</div>
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.label} className="flex justify-between text-xs">
              <span className="text-gray-500">{item.label}</span>
              <span className={cn("font-medium", item.color)}>
                {item.value > 0 ? `+${item.value}` : item.value}
              </span>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-1 mt-1 flex justify-between text-xs font-semibold">
            <span className="text-gray-700">Gesamt</span>
            <span className="text-gray-900">{breakdown.total}</span>
          </div>
        </div>
      </div>
    </>
  );
};

const CandidateCard = memo(function CandidateCard({
  tma,
  distance,
  matchScore,
  scoreBreakdown,
  status,
  onAdd,
  onUpdateStatus,
  onRemove,
  isAssigned,
}: {
  tma: TmaCandidate;
  distance?: number;
  matchScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  status?: string;
  onAdd?: () => void;
  onUpdateStatus?: (status: string) => void;
  onRemove?: () => void;
  isAssigned: boolean;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 p-3 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="truncate text-sm font-medium text-gray-900">
              {tma.first_name} {tma.last_name}
            </p>
            <QualityBadge tags={tma.status_tags} status={tma.status} />
            {tma.driving_license && (
              <DrivingLicenseBadge license={tma.driving_license} size="sm" showLabel={false} />
            )}
          </div>
          {tma.position_title && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{tma.position_title}</p>
          )}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {/* Distance - prominent */}
            {typeof distance === "number" && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                distance <= 10 ? "bg-green-100 text-green-700" :
                distance <= 25 ? "bg-blue-100 text-blue-700" :
                distance <= 50 ? "bg-amber-100 text-amber-700" :
                "bg-gray-100 text-gray-600"
              )}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                {distance} km
              </span>
            )}
            {/* City */}
            {tma.city && (
              <span className="text-xs text-gray-400">{tma.city}</span>
            )}
            {/* Match Score */}
            {typeof matchScore === "number" && (
              <div className="relative">
                <button
                  onClick={() => scoreBreakdown && setShowScoreBreakdown(!showScoreBreakdown)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors",
                    scoreBreakdown && "cursor-pointer"
                  )}
                >
                  {matchScore}% Match
                </button>
                {showScoreBreakdown && scoreBreakdown && (
                  <ScoreBreakdownPopup 
                    breakdown={scoreBreakdown} 
                    onClose={() => setShowScoreBreakdown(false)} 
                  />
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Actions */}
        {isAssigned ? (
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium border",
                status ? VACANCY_CANDIDATE_STATUS_COLORS[status as keyof typeof VACANCY_CANDIDATE_STATUS_COLORS] : "bg-gray-100 text-gray-600 border-gray-200"
              )}
            >
              {status ? VACANCY_CANDIDATE_STATUS_LABELS[status as keyof typeof VACANCY_CANDIDATE_STATUS_LABELS] : "Status"}
              <svg className="inline-block ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showStatusMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {VACANCY_CANDIDATE_STATUS_LIST.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        onUpdateStatus?.(s);
                        setShowStatusMenu(false);
                      }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50",
                        status === s && "bg-gray-50 font-medium"
                      )}
                    >
                      {VACANCY_CANDIDATE_STATUS_LABELS[s]}
                    </button>
                  ))}
                  <hr className="my-1" />
                  <button
                    onClick={() => {
                      onRemove?.();
                      setShowStatusMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                  >
                    Entfernen
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={onAdd}
            className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
          >
            Hinzufügen
          </button>
        )}
      </div>
      
      {/* Contact info */}
      <div className="mt-2 flex gap-2">
        {tma.phone && (
          <a
            href={`tel:${tma.phone}`}
            className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Anrufen
          </a>
        )}
        {tma.email && (
          <a
            href={`mailto:${tma.email}`}
            className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            E-Mail
          </a>
        )}
      </div>
    </div>
  );
});

export const CandidateMatches = memo(function CandidateMatches({
  vacancy,
  candidates,
  loading,
  onAddCandidate,
  onUpdateStatus,
  onRemove,
  onBack,
  isMobile = false,
}: Props) {
  const t = useTranslations("vacancy");
  const tTma = useTranslations("tma");
  const tCommon = useTranslations("common");
  const [activeTab, setActiveTab] = useState<"assigned" | "suggested">("assigned");

  const assignedCount = candidates?.assigned.length || 0;
  const suggestedCount = candidates?.suggested.length || 0;

  return (
    <aside className={cn(
      "flex flex-col border-l border-gray-200 bg-white",
      isMobile ? "w-full h-full" : "w-96"
    )}>
      {/* Header */}
      <header 
        className="flex items-center justify-between border-b border-gray-200 px-4 py-4"
        style={isMobile ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" } : undefined}
      >
        <div className="flex items-center gap-3">
          {isMobile && onBack && (
            <button
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 -ml-2"
            >
              <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Kandidaten</h2>
            <p className="text-xs text-gray-500">{vacancy.title}</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("assigned")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            activeTab === "assigned"
              ? "border-b-2 border-gray-900 text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          {t("assigned")} ({assignedCount})
        </button>
        <button
          onClick={() => setActiveTab("suggested")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            activeTab === "suggested"
              ? "border-b-2 border-gray-900 text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          {t("suggestions")} ({suggestedCount})
        </button>
      </div>

      {/* Content */}
      <div 
        className="flex-1 overflow-y-auto p-4"
        style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)" } : undefined}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
          </div>
        ) : activeTab === "assigned" ? (
          // Assigned candidates
          assignedCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <p className="mt-3 text-sm text-gray-500">{tCommon("noResults")}</p>
              <button
                onClick={() => setActiveTab("suggested")}
                className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {t("suggestions")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates?.assigned.map((vc) => (
                <CandidateCard
                  key={vc.id}
                  tma={vc.tma!}
                  distance={vc.distance_km}
                  status={vc.status}
                  onUpdateStatus={(s) => onUpdateStatus(vc.tma_id, s)}
                  onRemove={() => onRemove(vc.tma_id)}
                  isAssigned
                />
              ))}
            </div>
          )
        ) : (
          // Suggested candidates
          suggestedCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="mt-3 text-sm text-gray-500">Keine passenden Kandidaten gefunden</p>
              <p className="mt-1 text-xs text-gray-400">
                Passe die Kriterien an oder suche manuell
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates?.suggested.map((tma) => (
                <CandidateCard
                  key={tma.id}
                  tma={tma}
                  distance={tma.distance_km}
                  matchScore={tma.match_score}
                  scoreBreakdown={tma.score_breakdown}
                  onAdd={() => onAddCandidate(tma.id)}
                  isAssigned={false}
                />
              ))}
            </div>
          )
        )}
      </div>
    </aside>
  );
});
