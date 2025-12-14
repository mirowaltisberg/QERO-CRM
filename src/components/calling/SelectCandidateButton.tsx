"use client";

import { useTranslations } from "next-intl";

interface SelectCandidateButtonProps {
  onClick: () => void;
}

export function SelectCandidateButton({ onClick }: SelectCandidateButtonProps) {
  const t = useTranslations("candidateMode");

  return (
    <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 px-4 py-2">
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
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
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>

        {/* Text */}
        <div>
          <p className="text-sm font-medium text-gray-700">
            {t("callForCandidate")}
          </p>
          <p className="text-xs text-gray-500">{t("callForCandidateHint")}</p>
        </div>
      </div>

      {/* Button */}
      <button
        onClick={onClick}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span>{t("selectCandidate")}</span>
      </button>
    </div>
  );
}

