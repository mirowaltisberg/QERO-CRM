"use client";

import { memo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { Vacancy, VacancyCandidate, TmaCandidate } from "@/lib/types";
import { VACANCY_CANDIDATE_STATUS_LIST, VACANCY_CANDIDATE_STATUS_LABELS, VACANCY_CANDIDATE_STATUS_COLORS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { DrivingLicenseBadge } from "@/components/ui/DrivingLicenseBadge";
import { ExperienceLevelBadge } from "@/components/ui/ExperienceLevelSelector";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TextShimmer } from "@/components/ui/text-shimmer";

// AI Match result type
interface AIMatch {
  id: string;
  first_name: string;
  last_name: string;
  position_title: string | null;
  city: string | null;
  canton: string | null;
  postal_code: string | null;
  experience_level: string | null;
  driving_license: string | null;
  distance_km: number | null;
  ai_score: number;
  match_reason: string;
  rule_score: number;
}

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
            {tma.experience_level && (
              <ExperienceLevelBadge level={tma.experience_level} size="sm" />
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
  const [activeTab, setActiveTab] = useState<"assigned" | "suggested" | "ai">("assigned");

  // AI matching state
  const [aiMatches, setAiMatches] = useState<AIMatch[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRan, setAiRan] = useState(false);

  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [generatingEmail, setGeneratingEmail] = useState<"fast" | "best" | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const assignedCount = candidates?.assigned.length || 0;
  const suggestedCount = candidates?.suggested.length || 0;
  const aiCount = aiMatches.length;

  // Run AI matching
  const handleAiMatch = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch("/api/ai/match-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancyId: vacancy.id }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "AI Matching fehlgeschlagen");
      }
      setAiMatches(json.data?.matches || []);
      setAiRan(true);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI Matching fehlgeschlagen");
    } finally {
      setAiLoading(false);
    }
  }, [vacancy.id]);

  // Open email modal
  const handleOpenEmailModal = useCallback(() => {
    setShowEmailModal(true);
    setEmailSubject("");
    setEmailBody("");
    setEmailError(null);
    setEmailSent(false);
  }, []);

  // Generate email with AI
  const handleGenerateEmail = useCallback(async (mode: "fast" | "best") => {
    if (!vacancy.contact_id || assignedCount === 0) return;

    setGeneratingEmail(mode);
    setEmailError(null);
    setEmailBody("");

    try {
      // Get candidate IDs from assigned candidates
      const candidateIds = candidates?.assigned.map(vc => vc.tma_id) || [];
      
      const response = await fetch("/api/ai/generate-vacancy-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacancyId: vacancy.id,
          contactId: vacancy.contact_id,
          candidateIds,
          mode,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || t("emailGenerationError"));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      setEmailSubject(json.data.subject);
      setEmailBody(json.data.body);
    } catch (err) {
      console.error("Email generation error:", err);
      setEmailError(err instanceof Error ? err.message : t("emailGenerationError"));
    } finally {
      setGeneratingEmail(null);
    }
  }, [vacancy.id, vacancy.contact_id, candidates?.assigned, assignedCount, t]);

  // Send email
  const handleSendEmail = useCallback(async () => {
    if (!vacancy.contact_id || !emailSubject || !emailBody) return;

    setSendingEmail(true);
    setEmailError(null);

    try {
      const candidateIds = candidates?.assigned.map(vc => vc.tma_id) || [];

      const response = await fetch(`/api/contacts/${vacancy.contact_id}/send-vacancy-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacancyId: vacancy.id,
          candidateIds,
          subject: emailSubject,
          body: emailBody,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || t("emailSendError"));
      }

      setEmailSent(true);
    } catch (err) {
      console.error("Email send error:", err);
      setEmailError(err instanceof Error ? err.message : t("emailSendError"));
    } finally {
      setSendingEmail(false);
    }
  }, [vacancy.id, vacancy.contact_id, candidates?.assigned, emailSubject, emailBody, t]);

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
        <button
          onClick={() => setActiveTab("ai")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1",
            activeTab === "ai"
              ? "border-b-2 border-purple-600 text-purple-600"
              : "text-gray-500 hover:text-purple-600"
          )}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          AI {aiRan ? `(${aiCount})` : ""}
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
              
              {/* Send Email Button */}
              {vacancy.contact && (
                <button
                  onClick={handleOpenEmailModal}
                  className="w-full mt-4 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  {t("sendCandidatesEmail")} ({assignedCount})
                </button>
              )}
            </div>
          )
        ) : activeTab === "suggested" ? (
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
        ) : (
          // AI Matches tab
          <AIMatchesContent
            aiMatches={aiMatches}
            aiLoading={aiLoading}
            aiError={aiError}
            aiRan={aiRan}
            onRun={handleAiMatch}
            onAdd={onAddCandidate}
            t={t}
          />
        )}
      </div>

      {/* Email Modal */}
      <Modal
        open={showEmailModal}
        onClose={() => !sendingEmail && setShowEmailModal(false)}
        title={t("emailModalTitle")}
      >
        <div className="space-y-4 max-w-2xl">
          {emailSent ? (
            <div className="text-center py-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{t("emailSent")}</h3>
              <p className="mt-2 text-sm text-gray-500">{t("emailSentDescription")}</p>
              <button
                onClick={() => setShowEmailModal(false)}
                className="mt-6 rounded-lg bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                {tCommon("close")}
              </button>
            </div>
          ) : (
            <>
              {/* Info */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                <div className="flex items-start gap-2">
                  <svg className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-blue-800">{t("emailModalInfo")}</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {t("emailModalCompany")}: {vacancy.contact?.company_name || "Unbekannt"}
                    </p>
                    <p className="text-xs text-blue-600">
                      {t("emailModalCandidates")}: {assignedCount}
                    </p>
                  </div>
                </div>
              </div>

              {/* AI Generation Buttons */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">{t("generateWithAi")}</label>
                <div className="flex gap-2">
                  {/* Fast Button */}
                  <button
                    type="button"
                    onClick={() => handleGenerateEmail("fast")}
                    disabled={!!generatingEmail}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      generatingEmail === "fast"
                        ? "bg-gray-200 text-gray-500 cursor-wait border border-gray-300"
                        : generatingEmail
                        ? "bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-100"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                    )}
                  >
                    {generatingEmail === "fast" ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    )}
                    {t("draftFast")}
                  </button>
                  
                  {/* Best Button */}
                  <button
                    type="button"
                    onClick={() => handleGenerateEmail("best")}
                    disabled={!!generatingEmail}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      generatingEmail === "best"
                        ? "bg-purple-200 text-purple-500 cursor-wait"
                        : generatingEmail
                        ? "bg-purple-50 text-purple-200 cursor-not-allowed"
                        : "bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 shadow-sm hover:shadow-md"
                    )}
                  >
                    {generatingEmail === "best" ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    )}
                    {t("draftBest")}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {emailError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {emailError}
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="text-xs uppercase text-gray-400">{t("emailSubject")}</label>
                <Input
                  className="mt-1"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder={t("emailSubjectPlaceholder")}
                  disabled={!!generatingEmail}
                />
              </div>

              {/* Body with shimmer */}
              <div>
                <label className="text-xs uppercase text-gray-400">{t("emailBody")}</label>
                <div className="relative mt-1">
                  <Textarea
                    className={cn(
                      "min-h-[200px] font-mono text-xs transition-opacity",
                      generatingEmail && "opacity-30"
                    )}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder={t("emailBodyPlaceholder")}
                    disabled={!!generatingEmail}
                  />
                  {/* Shimmer overlay */}
                  {generatingEmail && (
                    <div className="absolute inset-0 pointer-events-none rounded-md bg-white/80 backdrop-blur-[1px] flex items-start justify-start p-4">
                      <div>
                        <TextShimmer className="text-sm font-medium" duration={1.5}>
                          {t("generatingEmail")}
                        </TextShimmer>
                        <p className="mt-2 text-xs text-gray-400">
                          {generatingEmail === "fast" ? t("generatingFastHint") : t("generatingBestHint")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Candidate List (preview) */}
              <div>
                <label className="text-xs uppercase text-gray-400">{t("includedCandidates")}</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {candidates?.assigned.map(vc => (
                    <span
                      key={vc.id}
                      className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                    >
                      {vc.tma?.first_name} {vc.tma?.last_name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => setShowEmailModal(false)}
                  disabled={sendingEmail}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {tCommon("cancel")}
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={!emailSubject || !emailBody || sendingEmail || !!generatingEmail}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingEmail ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t("sending")}
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                      {t("sendEmail")}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </aside>
  );
});

// AI Matches Content Component
interface AIMatchesContentProps {
  aiMatches: AIMatch[];
  aiLoading: boolean;
  aiError: string | null;
  aiRan: boolean;
  onRun: () => void;
  onAdd: (tmaId: string) => void;
  t: ReturnType<typeof useTranslations>;
}

function AIMatchesContent({ aiMatches, aiLoading, aiError, aiRan, onRun, onAdd, t }: AIMatchesContentProps) {
  if (!aiRan) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
          <svg className="h-7 w-7 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <p className="mt-4 text-sm font-medium text-gray-900">{t("aiMatchTitle")}</p>
        <p className="mt-1 text-xs text-gray-500 max-w-[250px]">{t("aiMatchDescription")}</p>
        <button
          onClick={onRun}
          disabled={aiLoading}
          className="mt-4 flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {aiLoading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t("aiMatching")}
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              {t("runAiMatch")}
            </>
          )}
        </button>
      </div>
    );
  }

  if (aiLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
        <p className="mt-4 text-sm text-gray-600">{t("aiMatching")}</p>
        <p className="mt-1 text-xs text-gray-400">{t("aiMatchingWait")}</p>
      </div>
    );
  }

  if (aiError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="mt-3 text-sm text-red-600">{aiError}</p>
        <button onClick={onRun} className="mt-3 text-sm font-medium text-purple-600 hover:text-purple-700">
          {t("retry")}
        </button>
      </div>
    );
  }

  if (aiMatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="mt-3 text-sm text-gray-500">{t("noAiMatches")}</p>
        <button onClick={onRun} className="mt-3 text-sm font-medium text-purple-600 hover:text-purple-700">
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">{t("aiMatchResults")}</p>
        <button
          onClick={onRun}
          disabled={aiLoading}
          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {t("refresh")}
        </button>
      </div>
      {aiMatches.map((match) => (
        <AIMatchCard key={match.id} match={match} onAdd={() => onAdd(match.id)} />
      ))}
    </div>
  );
}

// AI Match Card Component
function AIMatchCard({ match, onAdd }: { match: AIMatch; onAdd: () => void }) {
  const scoreColor = 
    match.ai_score >= 75 ? "bg-green-100 text-green-700 border-green-200" :
    match.ai_score >= 50 ? "bg-amber-100 text-amber-700 border-amber-200" :
    "bg-red-100 text-red-700 border-red-200";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 text-sm truncate">
              {match.first_name} {match.last_name}
            </h4>
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold border", scoreColor)}>
              {match.ai_score}%
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {match.position_title || "Keine Position"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {[match.postal_code, match.city || match.canton].filter(Boolean).join(" ") || "Unbekannt"}
            {match.distance_km !== null && ` · ${match.distance_km} km`}
          </p>
        </div>
        <button
          onClick={onAdd}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-purple-100 hover:text-purple-600"
          title="Hinzufügen"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
      {/* AI Match Reason */}
      <div className="mt-2 p-2 rounded bg-purple-50 border border-purple-100">
        <div className="flex items-start gap-1.5">
          <svg className="h-3.5 w-3.5 text-purple-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <p className="text-xs text-purple-800">{match.match_reason}</p>
        </div>
      </div>
    </div>
  );
}
