"use client";

import { useTranslations } from "next-intl";
import React from "react";
import type { TmaCandidate } from "@/lib/types";

interface CandidateModeBannerProps {
  candidate: TmaCandidate;
  onChangeCandidate: () => void;
  onExitMode: () => void;
  distanceFilter: number | null;
  onDistanceFilterChange: (value: number | null) => void;
  filteredCount: number;
  totalCount: number;
}

const DISTANCE_OPTIONS = [
  { value: null, label: "All" },
  { value: 10, label: "≤10 km" },
  { value: 25, label: "≤25 km" },
  { value: 50, label: "≤50 km" },
  { value: 100, label: "≤100 km" },
];

export function CandidateModeBanner({
  candidate,
  onChangeCandidate,
  onExitMode,
  distanceFilter,
  onDistanceFilterChange,
  filteredCount,
  totalCount,
}: CandidateModeBannerProps) {
  const t = useTranslations("candidateMode");

  return (
    <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        {/* Candidate icon */}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white">
          {candidate.first_name[0]}
          {candidate.last_name[0]}
        </div>

        {/* Info */}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">
            <span className="text-blue-600">{t("callingFor")}:</span>{" "}
            {candidate.first_name} {candidate.last_name}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {candidate.position_title && (
              <span className="truncate">{candidate.position_title}</span>
            )}
            {candidate.position_title && candidate.city && (
              <span className="text-gray-300">•</span>
            )}
            {candidate.city && (
              <span className="flex items-center gap-1">
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
            {(candidate.latitude && candidate.longitude) && (
              <>
                <span className="text-gray-300">•</span>
                <span className="text-green-600">
                  {filteredCount} / {totalCount} {t("companies")}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {/* Distance Filter */}
        {(candidate.latitude && candidate.longitude) && (
          <select
            value={distanceFilter ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onDistanceFilterChange(val === "" ? null : Number(val));
            }}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {DISTANCE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        {candidate.short_profile_url && (
          <button
            onClick={() => window.open(candidate.short_profile_url!, "_blank")}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-gray-50 hover:ring-gray-300"
            title={t("viewProfile")}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="hidden sm:inline">{t("profile")}</span>
          </button>
        )}

        <button
          onClick={onChangeCandidate}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm ring-1 ring-blue-200 transition-all hover:bg-blue-50 hover:ring-blue-300"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
          <span className="hidden sm:inline">{t("change")}</span>
        </button>

        <button
          onClick={onExitMode}
          className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-200"
        >
          <svg
            className="h-3.5 w-3.5"
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
          <span className="hidden sm:inline">{t("exit")}</span>
        </button>
      </div>
    </div>
  );
}

