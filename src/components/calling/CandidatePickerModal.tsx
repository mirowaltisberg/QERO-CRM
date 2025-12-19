"use client";

import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { TmaCandidate } from "@/lib/types";

interface CandidatePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (candidate: TmaCandidate) => void;
}

export function CandidatePickerModal({
  open,
  onClose,
  onSelect,
}: CandidatePickerModalProps) {
  const t = useTranslations("candidateMode");
  const tCommon = useTranslations("common");
  const [mounted, setMounted] = useState(false);
  const [candidates, setCandidates] = useState<TmaCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch candidates when modal opens
  useEffect(() => {
    if (!open) return;

    async function fetchCandidates() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/tma");
        if (!res.ok) {
          throw new Error("Failed to fetch candidates");
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
  }, [open]);

  useEffect(() => {
    if (!open) {
      // Ensure body overflow is reset when modal closes
      document.body.style.overflow = "";
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  // Filter candidates based on search query
  // Matches any part of first name, last name, position, city, or email
  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidates;

    const query = searchQuery.toLowerCase().trim();
    return candidates.filter((c) => {
      const firstName = c.first_name?.toLowerCase() || "";
      const lastName = c.last_name?.toLowerCase() || "";
      const fullName = `${firstName} ${lastName}`;
      const reverseName = `${lastName} ${firstName}`; // For "lastname firstname" searches
      const position = c.position_title?.toLowerCase() || "";
      const city = c.city?.toLowerCase() || "";
      const email = c.email?.toLowerCase() || "";

      return (
        firstName.includes(query) ||
        lastName.includes(query) ||
        fullName.includes(query) ||
        reverseName.includes(query) ||
        position.includes(query) ||
        city.includes(query) ||
        email.includes(query)
      );
    });
  }, [candidates, searchQuery]);

  const handleSelect = useCallback(
    (candidate: TmaCandidate) => {
      onSelect(candidate);
      onClose();
    },
    [onSelect, onClose]
  );

  if (!open || !mounted) return null;

  const portalRoot = typeof window !== "undefined" ? document.body : null;
  if (!portalRoot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-picker-title"
        className="flex w-full max-w-2xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl"
        style={{
          animation: "modalIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2
              id="candidate-picker-title"
              className="text-lg font-semibold text-gray-900"
            >
              {t("pickCandidate")}
            </h2>
            <p className="text-sm text-gray-500">
              {t("pickCandidateDescription")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        {/* Search */}
        <div className="border-b border-gray-100 px-6 py-3">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              autoFocus
            />
          </div>
        </div>

        {/* Candidates List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
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

          {!loading && !error && filteredCandidates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
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
              <p className="text-sm text-gray-600">{tCommon("noResults")}</p>
            </div>
          )}

          {!loading && !error && filteredCandidates.length > 0 && (
            <div className="space-y-2">
              {filteredCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => handleSelect(candidate)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  {/* Avatar/Initials */}
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 text-sm font-medium text-gray-600 group-hover:from-blue-100 group-hover:to-blue-200 group-hover:text-blue-700">
                    {candidate.first_name[0]}
                    {candidate.last_name[0]}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-gray-900">
                        {candidate.first_name} {candidate.last_name}
                      </p>
                      {/* Status Tags */}
                      {candidate.status_tags && candidate.status_tags.length > 0 && (
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
                      {candidate.position_title && (
                        <span className="truncate">{candidate.position_title}</span>
                      )}
                      {candidate.position_title && candidate.city && (
                        <span className="text-gray-300">•</span>
                      )}
                      {candidate.city && (
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
                      )}
                    </div>
                  </div>

                  {/* Location indicator */}
                  {candidate.latitude && candidate.longitude ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-500">
                      <svg
                        className="h-4 w-4"
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
                    </div>
                  ) : (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-400"
                      title={t("noLocation")}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Arrow */}
                  <svg
                    className="h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500"
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
        <footer className="border-t border-gray-100 px-6 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {filteredCandidates.length} {t("candidatesFound")}
            </p>
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              {tCommon("cancel")}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    portalRoot
  );
}

