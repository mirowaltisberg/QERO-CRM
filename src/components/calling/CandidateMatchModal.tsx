"use client";

import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { TmaRole, Contact } from "@/lib/types";
import { PdfPreviewModal } from "@/components/tma/PdfPreviewModal";

interface ScoreBreakdown {
  roleMatch: number;
  quality: number;
  experience: number;
  docsBonus: number;
  notesBonus: number;
  total: number;
}

interface MatchedCandidate {
  id: string;
  first_name: string;
  last_name: string;
  position_title: string | null;
  city: string | null;
  canton: string | null;
  postal_code: string | null;
  experience_level: string | null;
  driving_license: string | null;
  short_profile_url: string | null;
  distance_km: number | null;
  points_score: number;
  score_breakdown: ScoreBreakdown;
  status_tags: string[];
  quality_note: string | null;
  notes: string | null;
  ai_score?: number;
  match_reason?: string;
}

interface CandidateMatchModalProps {
  open: boolean;
  onClose: () => void;
  contact: Contact | null;
}

export function CandidateMatchModal({
  open,
  onClose,
  contact,
}: CandidateMatchModalProps) {
  const t = useTranslations("candidateMatch");
  const tCommon = useTranslations("common");
  const [mounted, setMounted] = useState(false);
  
  // Role selection
  const [roles, setRoles] = useState<TmaRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [roleSearch, setRoleSearch] = useState("");
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  
  // Method toggle
  const [method, setMethod] = useState<"points" | "ai">("points");
  
  // Results
  const [results, setResults] = useState<MatchedCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  // PDF Preview
  const [previewCandidate, setPreviewCandidate] = useState<MatchedCandidate | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch roles when modal opens
  useEffect(() => {
    if (!open) return;
    
    async function fetchRoles() {
      setRolesLoading(true);
      try {
        const res = await fetch("/api/tma/roles/all");
        if (res.ok) {
          const json = await res.json();
          setRoles(json.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch roles:", err);
      } finally {
        setRolesLoading(false);
      }
    }
    
    fetchRoles();
  }, [open]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedRole("");
      setRoleSearch("");
      setResults([]);
      setError(null);
      setHasSearched(false);
      setMethod("points");
    }
  }, [open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (previewCandidate) {
          setPreviewCandidate(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose, previewCandidate]);

  // Filter roles based on search
  const filteredRoles = useMemo(() => {
    if (!roleSearch.trim()) return roles;
    const query = roleSearch.toLowerCase();
    return roles.filter(r => r.name.toLowerCase().includes(query));
  }, [roles, roleSearch]);

  // Search for matching candidates
  const handleSearch = useCallback(async () => {
    if (!contact?.id || !selectedRole) return;
    
    setLoading(true);
    setError(null);
    setHasSearched(true);
    
    try {
      const res = await fetch(`/api/contacts/${contact.id}/match-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleName: selectedRole, method }),
      });
      
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Search failed");
      }
      
      const json = await res.json();
      setResults(json.data?.matches || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [contact?.id, selectedRole, method]);

  // Handle candidate click
  const handleCandidateClick = useCallback((candidate: MatchedCandidate) => {
    if (candidate.short_profile_url) {
      setPreviewCandidate(candidate);
    }
  }, []);

  // Select role from dropdown
  const handleRoleSelect = useCallback((roleName: string) => {
    setSelectedRole(roleName);
    setRoleSearch(roleName);
    setShowRoleDropdown(false);
  }, []);

  if (!open || !mounted) return null;

  const portalRoot = typeof window !== "undefined" ? document.body : null;
  if (!portalRoot) return null;

  return createPortal(
    <>
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
          aria-labelledby="candidate-match-title"
          className="flex w-full max-w-3xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl"
          style={{
            animation: "modalIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            maxHeight: "85vh",
          }}
        >
          {/* Header */}
          <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2
                id="candidate-match-title"
                className="text-lg font-semibold text-gray-900"
              >
                {t("title")}
              </h2>
              <p className="text-sm text-gray-500">
                {contact?.company_name} {contact?.city ? `• ${contact.city}` : ""}
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

          {/* Search Controls */}
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="flex flex-wrap items-end gap-3">
              {/* Role Selection */}
              <div className="relative flex-1 min-w-[200px]">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t("role")}
                </label>
                <input
                  type="text"
                  placeholder={t("selectRole")}
                  value={roleSearch}
                  onChange={(e) => {
                    setRoleSearch(e.target.value);
                    setSelectedRole(e.target.value);
                    setShowRoleDropdown(true);
                  }}
                  onFocus={() => setShowRoleDropdown(true)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {showRoleDropdown && filteredRoles.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {filteredRoles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => handleRoleSelect(role.name)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: role.color }}
                        />
                        {role.name}
                        {role.team && (
                          <span className="ml-auto text-xs text-gray-400">
                            {role.team.name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {rolesLoading && (
                  <div className="absolute right-3 top-8">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
                  </div>
                )}
              </div>

              {/* Method Toggle */}
              <div className="flex-shrink-0">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t("method")}
                </label>
                <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setMethod("points")}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      method === "points"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    {t("points")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("ai")}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      method === "ai"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    {t("ai")}
                  </button>
                </div>
              </div>

              {/* Search Button */}
              <button
                type="button"
                onClick={handleSearch}
                disabled={!selectedRole || loading}
                className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {t("searching")}
                  </span>
                ) : (
                  t("search")
                )}
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {error && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-2 text-red-500">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-600">{error}</p>
              </div>
            )}

            {!hasSearched && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 text-gray-300">
                  <svg className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">{t("selectRoleToSearch")}</p>
              </div>
            )}

            {hasSearched && !loading && results.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-2 text-gray-400">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-600">{t("noResults")}</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-2">
                {results.map((candidate) => (
                  <button
                    key={candidate.id}
                    onClick={() => handleCandidateClick(candidate)}
                    disabled={!candidate.short_profile_url}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                      candidate.short_profile_url
                        ? "border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-md"
                        : "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60"
                    )}
                  >
                    {/* Avatar */}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 text-sm font-medium text-gray-600 group-hover:from-blue-100 group-hover:to-blue-200 group-hover:text-blue-700">
                      {candidate.first_name[0]}{candidate.last_name[0]}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-gray-900">
                          {candidate.first_name} {candidate.last_name}
                        </p>
                        {/* Quality Tags */}
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
                        {/* No Profile Warning */}
                        {!candidate.short_profile_url && (
                          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600">
                            {t("noProfile")}
                          </span>
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
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                            {candidate.city}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Distance Badge */}
                    {candidate.distance_km !== null && (
                      <div className="flex-shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                        {candidate.distance_km} km
                      </div>
                    )}

                    {/* Score */}
                    <div className="flex-shrink-0 text-right">
                      {method === "ai" && candidate.ai_score !== undefined ? (
                        <div>
                          <div className="text-lg font-semibold text-gray-900">
                            {candidate.ai_score}
                          </div>
                          {candidate.match_reason && (
                            <p className="max-w-[150px] truncate text-xs text-gray-500" title={candidate.match_reason}>
                              {candidate.match_reason}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="text-lg font-semibold text-gray-900">
                            {candidate.points_score}
                          </div>
                          <p className="text-xs text-gray-500">{t("pointsLabel")}</p>
                        </div>
                      )}
                    </div>

                    {/* Arrow (only if has profile) */}
                    {candidate.short_profile_url && (
                      <svg
                        className="h-5 w-5 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <footer className="border-t border-gray-100 px-6 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {hasSearched && !loading && `${results.length} ${t("candidatesFound")}`}
              </p>
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                {tCommon("close")}
              </button>
            </div>
          </footer>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {previewCandidate?.short_profile_url && (
        <PdfPreviewModal
          open={!!previewCandidate}
          onClose={() => setPreviewCandidate(null)}
          pdfUrl={previewCandidate.short_profile_url}
          candidateId={previewCandidate.id}
          candidateName={`${previewCandidate.first_name} ${previewCandidate.last_name}`}
        />
      )}
    </>,
    portalRoot
  );
}
