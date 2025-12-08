"use client";

import { memo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Vacancy } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { VACANCY_STATUS_LIST, VACANCY_STATUS_LABELS, VACANCY_STATUS_COLORS, VACANCY_URGENCY_LABELS } from "@/lib/utils/constants";

interface VacancyQuickViewProps {
  vacancy: Vacancy | null;
  isOpen: boolean;
  onClose: () => void;
}

export const VacancyQuickView = memo(function VacancyQuickView({
  vacancy,
  isOpen,
  onClose,
}: VacancyQuickViewProps) {
  const router = useRouter();

  if (!isOpen || !vacancy) return null;

  const portalRoot = typeof window !== "undefined" ? document.body : null;
  if (!portalRoot) return null;

  const handleGoToVakanzen = () => {
    onClose();
    router.push("/vakanzen");
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/25"
        style={{ animation: "vacancy-backdrop-enter 300ms ease-out forwards" }}
      />
      
      {/* Popup Card */}
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl border border-gray-100"
        style={{
          animation: "vacancy-popup-enter 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900 truncate">{vacancy.title}</h2>
                {/* Urgency flames */}
                <div className="flex gap-0.5 flex-shrink-0">
                  {Array.from({ length: vacancy.urgency || 1 }).map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 23c-4.97 0-9-3.58-9-8 0-2.52 1.17-4.83 3.15-6.42.9-.73 1.85-1.27 2.85-1.58.39-.12.8.16.8.57v.44c0 1.08.22 2.14.65 3.12.15.36.55.48.87.27.17-.11.32-.24.45-.39.72-.8 1.14-1.82 1.23-2.9.09-1.08-.12-2.17-.63-3.14-.25-.47.18-1.02.7-.89 1.76.45 3.38 1.38 4.72 2.73C19.32 8.92 21 11.87 21 15c0 4.42-4.03 8-9 8z"/>
                    </svg>
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{vacancy.contact?.company_name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Status Pipeline */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Status</p>
            <div className="flex gap-2">
              {VACANCY_STATUS_LIST.map((status, index) => {
                const isActive = vacancy.status === status;
                const isPast = VACANCY_STATUS_LIST.indexOf(vacancy.status) > index;
                return (
                  <div
                    key={status}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2 text-center text-xs font-medium transition-colors",
                      isActive
                        ? `text-white`
                        : isPast
                          ? "bg-gray-100 text-gray-500"
                          : "bg-gray-50 text-gray-400"
                    )}
                    style={isActive ? { backgroundColor: VACANCY_STATUS_COLORS[status] } : undefined}
                  >
                    {VACANCY_STATUS_LABELS[status]}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Role */}
            {vacancy.role && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Rolle</p>
                <p className="text-sm text-gray-900">{vacancy.role}</p>
              </div>
            )}

            {/* Min Quality */}
            {vacancy.min_quality && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Min. Qualität</p>
                <span className={cn(
                  "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                  vacancy.min_quality === "A" && "bg-green-100 text-green-700",
                  vacancy.min_quality === "B" && "bg-amber-100 text-amber-700",
                  vacancy.min_quality === "C" && "bg-red-100 text-red-700"
                )}>
                  {vacancy.min_quality}
                </span>
              </div>
            )}

            {/* Urgency */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Dringlichkeit</p>
              <p className="text-sm text-gray-900">{VACANCY_URGENCY_LABELS[vacancy.urgency || 1]}</p>
            </div>

            {/* Location */}
            {(vacancy.city || vacancy.postal_code) && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Standort</p>
                <p className="text-sm text-gray-900">
                  {[vacancy.postal_code, vacancy.city].filter(Boolean).join(" ")}
                </p>
              </div>
            )}

            {/* Radius */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Suchradius</p>
              <p className="text-sm text-gray-900">{vacancy.radius_km || 25} km</p>
            </div>

            {/* Candidate Count */}
            {vacancy.candidate_count !== undefined && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Kandidaten</p>
                <p className="text-sm text-gray-900">{vacancy.candidate_count}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {vacancy.description && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Beschreibung</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{vacancy.description}</p>
            </div>
          )}

          {/* Created Info */}
          <div className="text-xs text-gray-400">
            Erstellt am {new Date(vacancy.created_at).toLocaleDateString("de-CH")}
            {vacancy.creator?.full_name && ` von ${vacancy.creator.full_name}`}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Schliessen
          </button>
          <button
            type="button"
            onClick={handleGoToVakanzen}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
              <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
            </svg>
            In Vakanzen öffnen
          </button>
        </div>
      </div>
    </div>,
    portalRoot
  );
});
