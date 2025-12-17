"use client";

import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

interface CandidateModeModalProps {
  open: boolean;
  onSelectCandidate: () => void;
  onBrowseAround: () => void;
}

export function CandidateModeModal({
  open,
  onSelectCandidate,
  onBrowseAround,
}: CandidateModeModalProps) {
  const t = useTranslations("candidateMode");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onBrowseAround();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onBrowseAround]);

  if (!open || !mounted) return null;

  const portalRoot = typeof window !== "undefined" ? document.body : null;
  if (!portalRoot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-mode-title"
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl"
        style={{
          animation: "modalIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        }}
      >
        {/* Header */}
        <header className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <div>
              <h2
                id="candidate-mode-title"
                className="text-lg font-semibold text-gray-900"
              >
                {t("title")}
              </h2>
              <p className="text-sm text-gray-500">{t("subtitle")}</p>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="px-6 py-6">
          <p className="mb-6 text-sm text-gray-600">{t("description")}</p>

          <div className="space-y-3">
            {/* Select Candidate Button */}
            <button
              onClick={onSelectCandidate}
              className="group flex w-full items-center gap-4 rounded-xl border-2 border-blue-100 bg-blue-50/50 p-4 text-left transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white transition-transform group-hover:scale-110">
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
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {t("selectCandidate")}
                </p>
                <p className="text-sm text-gray-500">
                  {t("selectCandidateDescription")}
                </p>
              </div>
              <svg
                className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1"
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

            {/* Browse Around Button */}
            <button
              onClick={onBrowseAround}
              className="group flex w-full items-center gap-4 rounded-xl border-2 border-gray-100 bg-gray-50/50 p-4 text-left transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-500 text-white transition-transform group-hover:scale-110">
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
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{t("browseAround")}</p>
                <p className="text-sm text-gray-500">
                  {t("browseAroundDescription")}
                </p>
              </div>
              <svg
                className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1"
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
          </div>
        </div>
      </div>
    </div>,
    portalRoot
  );
}

