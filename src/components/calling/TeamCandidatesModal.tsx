"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

interface TeamCandidateRow {
  id: string;
  first_name: string;
  last_name: string;
  position_title: string | null;
  city: string | null;
  status_tags: string[];
  short_profile_url: string;
  distance_km: number | null;
  role: {
    id: string;
    name: string;
    color: string;
  };
}

interface TeamCandidatesModalProps {
  open: boolean;
  onClose: () => void;
  contactId: string;
  selectedCandidateId: string;
  contactName?: string;
}

export function TeamCandidatesModal({
  open,
  onClose,
  contactId,
  selectedCandidateId,
  contactName,
}: TeamCandidatesModalProps) {
  const t = useTranslations("teamCandidates");
  const [candidates, setCandidates] = useState<TeamCandidateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch candidates when sheet opens
  useEffect(() => {
    if (!open) return;

    async function fetchCandidates() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/contacts/${contactId}/team-candidates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedCandidateId }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to fetch candidates");
        }
        const json = await res.json();
        setCandidates(json.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading candidates");
      } finally {
        setLoading(false);
      }
    }

    fetchCandidates();
  }, [open, contactId, selectedCandidateId]);

  const handleRowClick = useCallback((candidate: TeamCandidateRow) => {
    window.open(candidate.short_profile_url, "_blank");
  }, []);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>
            {contactName ? t("descriptionFor", { company: contactName }) : t("description")}
          </SheetDescription>
        </SheetHeader>

        {/* Candidates List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 -mx-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="mb-2 text-red-500">
                <svg
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <p className="text-sm text-gray-600">{error}</p>
            </div>
          )}

          {!loading && !error && candidates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="mb-2 text-gray-400">
                <svg
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <p className="text-sm text-gray-600">{t("noResults")}</p>
            </div>
          )}

          {!loading && !error && candidates.length > 0 && (
            <div className="space-y-2 px-5">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => handleRowClick(candidate)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  {/* Role color dot + Name */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {/* Role color indicator */}
                    <div
                      className="h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: candidate.role.color }}
                      title={candidate.role.name}
                    />

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-gray-900">
                          {candidate.first_name} {candidate.last_name}
                        </p>
                        {/* Status Tags */}
                        {candidate.status_tags.length > 0 && (
                          <div className="flex gap-1">
                            {candidate.status_tags.map((tag) => (
                              <span
                                key={tag}
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-xs font-medium",
                                  tag === "A" && "bg-green-100 text-green-700",
                                  tag === "B" && "bg-yellow-100 text-yellow-700",
                                  tag === "C" && "bg-red-100 text-red-700"
                                )}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span className="truncate">{candidate.role.name}</span>
                        {candidate.city && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span className="flex items-center gap-1 text-gray-400">
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              {candidate.city}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Distance Badge */}
                  <div className="flex-shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {candidate.distance_km !== null
                      ? `${candidate.distance_km} km`
                      : "—"}
                  </div>

                  {/* Arrow */}
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <SheetFooter>
          <p className="text-xs text-gray-400">
            {candidates.length} {t("candidatesFound")}
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
