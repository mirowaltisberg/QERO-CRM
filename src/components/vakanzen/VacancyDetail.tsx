"use client";

import { memo, useState } from "react";
import type { Vacancy } from "@/lib/types";
import type { VacancyStatus } from "@/lib/utils/constants";
import { VACANCY_STATUS_LIST, VACANCY_STATUS_LABELS, VACANCY_STATUS_COLORS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { HoldToConfirmButton } from "@/components/ui/HoldToConfirmButton";
import { UrgencyBadge } from "./UrgencyBadge";
import { DrivingLicenseBadge } from "@/components/ui/DrivingLicenseBadge";

interface Props {
  vacancy: Vacancy;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: VacancyStatus) => void;
  onBack?: () => void;
  onShowCandidates?: () => void;
  candidateCount?: number;
  isMobile?: boolean;
}

export const VacancyDetail = memo(function VacancyDetail({
  vacancy,
  onEdit,
  onDelete,
  onStatusChange,
  onBack,
  onShowCandidates,
  candidateCount = 0,
  isMobile = false,
}: Props) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <section className={cn(
      "flex flex-col bg-white overflow-hidden",
      isMobile ? "w-full h-full" : "flex-1"
    )}>
      {/* Header */}
      <header 
        className="flex items-center justify-between border-b border-gray-200 px-6 py-4"
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
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">{vacancy.title}</h1>
              <UrgencyBadge urgency={vacancy.urgency} size="md" />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-gray-500">{vacancy.contact?.company_name}</p>
              {vacancy.contact?.team && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded text-white"
                  style={{ backgroundColor: vacancy.contact.team.color || "#9CA3AF" }}
                >
                  {vacancy.contact.team.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            title="Bearbeiten"
          >
            <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <HoldToConfirmButton
            onConfirm={onDelete}
            label="Löschen"
            confirmLabel="Halten..."
            successLabel="✓"
            variant="danger"
            size="xs"
            holdDuration={1200}
          />
        </div>
      </header>

      {/* Content */}
      <div 
        className="flex-1 overflow-y-auto p-6"
        style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)" } : undefined}
      >
        {/* Status Pipeline */}
        <div className="mb-6">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Status</h2>
          <div className="flex gap-2">
            {VACANCY_STATUS_LIST.map((status, index) => {
              const isActive = vacancy.status === status;
              const isPast = VACANCY_STATUS_LIST.indexOf(vacancy.status) > index;
              
              return (
                <button
                  key={status}
                  onClick={() => onStatusChange(status)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border",
                    isActive ? VACANCY_STATUS_COLORS[status] : 
                    isPast ? "bg-gray-100 text-gray-500 border-gray-200" :
                    "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                  )}
                >
                  <div className="flex items-center justify-center gap-2">
                    {isPast && !isActive && (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {VACANCY_STATUS_LABELS[status]}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Company Info */}
        <div className="mb-6 rounded-xl border border-gray-200 p-4">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Firma</h2>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">{vacancy.contact?.company_name}</p>
            {vacancy.contact?.city && (
              <p className="text-sm text-gray-500">
                {vacancy.contact.street && `${vacancy.contact.street}, `}
                {vacancy.contact.city}
                {vacancy.contact.canton && ` ${vacancy.contact.canton}`}
              </p>
            )}
            {vacancy.contact?.phone && (
              <a href={`tel:${vacancy.contact.phone}`} className="block text-sm text-blue-600 hover:underline">
                {vacancy.contact.phone}
              </a>
            )}
            {vacancy.contact?.email && (
              <a href={`mailto:${vacancy.contact.email}`} className="block text-sm text-blue-600 hover:underline">
                {vacancy.contact.email}
              </a>
            )}
          </div>
        </div>

        {/* Requirements */}
        <div className="mb-6 rounded-xl border border-gray-200 p-4">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Anforderungen</h2>
          <div className="grid grid-cols-2 gap-4">
            {vacancy.role && (
              <div>
                <p className="text-xs text-gray-400">Rolle</p>
                <p className="text-sm font-medium text-gray-900">{vacancy.role}</p>
              </div>
            )}
            {vacancy.min_quality && (
              <div>
                <p className="text-xs text-gray-400">Min. Qualität</p>
                <span className={cn(
                  "inline-block mt-1 rounded px-2 py-0.5 text-xs font-medium",
                  vacancy.min_quality === "A" ? "bg-green-100 text-green-700" :
                  vacancy.min_quality === "B" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                )}>
                  {vacancy.min_quality} Kandidat
                </span>
              </div>
            )}
            {vacancy.city && (
              <div>
                <p className="text-xs text-gray-400">Standort</p>
                <p className="text-sm font-medium text-gray-900">
                  {vacancy.city}
                  {vacancy.postal_code && ` (${vacancy.postal_code})`}
                </p>
              </div>
            )}
            {vacancy.radius_km && (
              <div>
                <p className="text-xs text-gray-400">Suchradius</p>
                <p className="text-sm font-medium text-gray-900">{vacancy.radius_km} km</p>
              </div>
            )}
            {vacancy.driving_license && (
              <div>
                <p className="text-xs text-gray-400">Führerschein</p>
                <div className="mt-1">
                  <DrivingLicenseBadge license={vacancy.driving_license} size="md" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {vacancy.description && (
          <div className="mb-6 rounded-xl border border-gray-200 p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Beschreibung</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{vacancy.description}</p>
          </div>
        )}

        {/* Meta */}
        <div className="rounded-xl border border-gray-200 p-4">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Info</h2>
          <div className="space-y-2 text-sm text-gray-500">
            <p>Erstellt am {formatDate(vacancy.created_at)}</p>
            {vacancy.creator && (
              <p>von {vacancy.creator.full_name}</p>
            )}
            {vacancy.updated_at !== vacancy.created_at && (
              <p>Aktualisiert am {formatDate(vacancy.updated_at)}</p>
            )}
          </div>
        </div>

        {/* Mobile: Candidates Button */}
        {isMobile && onShowCandidates && (
          <button
            onClick={onShowCandidates}
            className="mt-6 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Kandidaten anzeigen
            {candidateCount > 0 && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                {candidateCount}
              </span>
            )}
          </button>
        )}
      </div>
    </section>
  );
});
