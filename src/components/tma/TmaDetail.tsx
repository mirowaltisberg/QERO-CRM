"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { NotesPanel } from "@/components/calling/NotesPanel";
import { RoleDropdown } from "./RoleDropdown";
import { HoldToConfirmButton } from "@/components/ui/HoldToConfirmButton";
import type { TmaCandidate, TmaRole } from "@/lib/types";
import { 
  TMA_STATUS_LIST, 
  TMA_STATUS_LABELS,
  TMA_STATUS_STYLES, 
  TMA_ACTIVITY_STYLES,
  type TmaStatus,
  type TmaActivity,
  type DrivingLicense,
  type ExperienceLevel,
} from "@/lib/utils/constants";
import { DrivingLicenseSelector, DrivingLicenseBadge } from "@/components/ui/DrivingLicenseBadge";
import { ExperienceLevelSelector } from "@/components/ui/ExperienceLevelSelector";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

interface Props {
  candidate: TmaCandidate | null;
  roles: TmaRole[];
  rolesLoading: boolean;
  onCreateRole: (payload: { name: string; color: string; note?: string | null }) => Promise<TmaRole>;
  onUpdateRoleMetadata: (id: string, payload: Partial<Pick<TmaRole, "name" | "color" | "note">>) => Promise<TmaRole>;
  onDeleteRole: (id: string) => Promise<void>;
  onRefreshRoles: () => Promise<void>;
  onToggleStatusTag: (status: TmaStatus) => Promise<void> | void;
  onClearStatusTags: () => Promise<void> | void;
  onUpdateQualityNote: (value: string | null) => Promise<void> | void;
  onUpdateActivity: (activity: TmaActivity) => Promise<void> | void;
  onClearActivity: () => Promise<void> | void;
  onScheduleFollowUp: (args: { date: Date; note?: string }) => Promise<void> | void;
  onUpdateNotes: (value: string | null) => Promise<void>;
  onNoteAdded?: () => void;
  onUpdateDocuments: (
    payload: { cv_url?: string | null; references_url?: string | null; short_profile_url?: string | null; ahv_url?: string | null; id_url?: string | null; bank_url?: string | null }
  ) => Promise<void>;
  onUpdatePosition: (value: string | null) => Promise<void> | void;
  onUpdateAddress: (payload: { city: string | null; street: string | null; postal_code: string | null }) => Promise<void> | void;
  onUpdatePhone: (value: string | null) => Promise<void> | void;
  onUpdateDrivingLicense: (value: DrivingLicense | null) => Promise<void> | void;
  onUpdateExperienceLevel: (value: ExperienceLevel | null) => Promise<void> | void;
  onClaim: () => Promise<void> | void;
  onUnclaim: () => Promise<void> | void;
  isMobile?: boolean;
}

const STATUS_ORDER: TmaStatus[] = ["A", "B", "C"];

function getStatusTags(candidate: TmaCandidate | null) {
  if (!candidate) return [];
  if (candidate.status_tags && candidate.status_tags.length > 0) return sortStatusTags(candidate.status_tags);
  return candidate.status ? [candidate.status] : [];
}

function sortStatusTags(tags: TmaStatus[]) {
  return [...tags].sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
}

export function TmaDetail({
  candidate,
  roles,
  rolesLoading,
  onCreateRole,
  onUpdateRoleMetadata,
  onDeleteRole,
  onRefreshRoles,
  onToggleStatusTag,
  onClearStatusTags,
  onUpdateQualityNote,
  onUpdateActivity,
  onClearActivity,
  onScheduleFollowUp,
  onUpdateNotes,
  onNoteAdded,
  onUpdateDocuments,
  onUpdatePosition,
  onUpdateAddress,
  onUpdatePhone,
  onUpdateDrivingLicense,
  onUpdateExperienceLevel,
  onClaim,
  onUnclaim,
  isMobile = false,
}: Props) {
  const t = useTranslations("tma");
  const tQuality = useTranslations("quality");
  const tActivity = useTranslations("activity");
  const tCommon = useTranslations("common");
  const tDrivingLicense = useTranslations("drivingLicense");
  
  const initialFollowUpDate = candidate?.follow_up_at ? new Date(candidate.follow_up_at) : null;
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(
    initialFollowUpDate ? initialFollowUpDate.toISOString().slice(0, 10) : getTomorrowISO()
  );
  const [followUpTime, setFollowUpTime] = useState(
    initialFollowUpDate ? initialFollowUpDate.toISOString().slice(11, 16) : "09:00"
  );
  const [followUpNote, setFollowUpNote] = useState(candidate?.follow_up_note ?? "");
  const [qualityNote, setQualityNote] = useState(candidate?.quality_note ?? "");
  const qualityNoteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [uploading, setUploading] = useState<"cv" | "references" | "short_profile" | "ahv" | "id" | "bank" | null>(null);

  // Sync quality note when candidate changes
  useEffect(() => {
    setQualityNote(candidate?.quality_note ?? "");
  }, [candidate?.id, candidate?.quality_note]);

  // Debounced save for quality note
  const handleQualityNoteChange = useCallback((value: string) => {
    setQualityNote(value);
    if (qualityNoteTimeoutRef.current) {
      clearTimeout(qualityNoteTimeoutRef.current);
    }
    qualityNoteTimeoutRef.current = setTimeout(() => {
      onUpdateQualityNote(value.trim() || null);
    }, 800);
  }, [onUpdateQualityNote]);
  const [city, setCity] = useState(() => candidate?.city ?? "");
  const [street, setStreet] = useState(() => candidate?.street ?? "");
  const [postalCode, setPostalCode] = useState(() => candidate?.postal_code ?? "");
  const [phone, setPhone] = useState(() => candidate?.phone ?? "");
  const handleRoleSelect = useCallback(
    async (roleName: string | null) => {
      if (!candidate) return;
      const current = candidate.position_title?.trim() || null;
      const next = roleName?.trim() || null;
      if (current === next) return;
      await onUpdatePosition(next);
    },
    [candidate, onUpdatePosition]
  );

  const handleAddressBlur = useCallback(async () => {
    if (!candidate) return;
    const payload = {
      city: city.trim() ? city.trim() : null,
      street: street.trim() ? street.trim() : null,
      postal_code: postalCode.trim() ? postalCode.trim() : null,
    };
    if (
      payload.city === (candidate.city ?? null) &&
      payload.street === (candidate.street ?? null) &&
      payload.postal_code === (candidate.postal_code ?? null)
    ) {
      return;
    }
    await onUpdateAddress(payload);
  }, [candidate, city, street, postalCode, onUpdateAddress]);

  const handlePhoneBlur = useCallback(async () => {
    if (!candidate) return;
    const trimmed = phone.trim() || null;
    if (trimmed === (candidate.phone ?? null)) return;
    await onUpdatePhone(trimmed);
  }, [candidate, phone, onUpdatePhone]);

  const handleQuickFollowUp = async () => {
    if (!candidate) return;
    const date = getTomorrowNine();
    await onScheduleFollowUp({ date, note: candidate.follow_up_note ?? undefined });
  };

  const handleCustomFollowUp = async () => {
    const dt = combineDateTime(followUpDate, followUpTime);
    if (!dt) return;
    await onScheduleFollowUp({ date: dt, note: followUpNote });
    setIsFollowUpModalOpen(false);
  };

  const handleUpload = useCallback(
    async (file: File, type: "cv" | "references" | "short_profile" | "ahv" | "id" | "bank") => {
      if (!candidate) return;
      const supabase = createClient();
      const bucket = "tma-docs";
      const path = `${candidate.id}/${type}-${Date.now()}-${file.name}`;
      setUploading(type);
      
      const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) {
        console.error("Upload error", error);
        alert(`Upload failed: ${error.message}`);
        setUploading(null);
        return;
      }
      
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      
      try {
        await onUpdateDocuments({
          cv_url: type === "cv" ? data.publicUrl : candidate.cv_url,
          references_url: type === "references" ? data.publicUrl : candidate.references_url,
          short_profile_url: type === "short_profile" ? data.publicUrl : candidate.short_profile_url,
          ahv_url: type === "ahv" ? data.publicUrl : candidate.ahv_url,
          id_url: type === "id" ? data.publicUrl : candidate.id_url,
          bank_url: type === "bank" ? data.publicUrl : candidate.bank_url,
        });
      } catch (err) {
        console.error("Failed to save document URL:", err);
        alert(`Failed to save document: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
      
      setUploading(null);
    },
    [candidate, onUpdateDocuments]
  );

  const phoneLink = useMemo(() => candidate?.phone?.replace(/\s+/g, ""), [candidate?.phone]);
  const statusTags = useMemo(() => getStatusTags(candidate), [candidate]);
  const activeRole = useMemo(() => {
    if (!candidate?.position_title) return null;
    const normalized = candidate.position_title.trim().toLowerCase();
    return roles.find((role) => role.name.trim().toLowerCase() === normalized) ?? null;
  }, [candidate, roles]);
  const roleLabel = candidate?.position_title?.trim() ?? null;
  const roleColor = activeRole?.color ?? "#4B5563";

  if (!candidate) {
    return (
      <section className="flex flex-1 items-center justify-center text-sm text-gray-500">
        {t("selectCandidate")}
      </section>
    );
  }

  const claimer = candidate.claimer;
  const claimerInitials = claimer?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";

  return (
    <section className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {/* Claimed status */}
          <div className="flex items-center gap-2 mb-1">
            {claimer ? (
              <>
                <div className="h-5 w-5 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
                  {claimer.avatar_url ? (
                    <Image
                      src={claimer.avatar_url}
                      alt={claimer.full_name || "Claimer"}
                      width={20}
                      height={20}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[8px] font-medium text-gray-500">
                      {claimerInitials}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-500">{claimer.full_name}</span>
                <HoldToConfirmButton
                  onConfirm={onUnclaim}
                  label="Freigeben"
                  confirmLabel="Halten..."
                  successLabel="✓"
                  variant="danger"
                  size="xs"
                  holdDuration={1200}
                />
              </>
            ) : (
              <>
                <span className="text-xs text-orange-600 font-medium">{t("unclaimed")}</span>
                <button
                  onClick={onClaim}
                  className="rounded-full border border-blue-500 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  {tCommon("claim")}
                </button>
              </>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            {claimer && (
              <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
                {claimer.avatar_url ? (
                  <Image
                    src={claimer.avatar_url}
                    alt={claimer.full_name || "Claimer"}
                    width={32}
                    height={32}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-500">
                    {claimerInitials}
                  </div>
                )}
              </div>
            )}
            {candidate.first_name} {candidate.last_name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
            {candidate.email && (
              <a href={`mailto:${candidate.email}`} className="hover:text-gray-900">
                {candidate.email}
              </a>
            )}
            {candidate.phone && (
              <a
                href={`tel:${phoneLink}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {candidate.phone}
              </a>
            )}
            {candidate.canton && <CantonTag canton={candidate.canton} size="md" />}
            {roleLabel && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: `${roleColor}40`,
                  backgroundColor: `${roleColor}14`,
                  color: roleColor,
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: roleColor }}
                />
                {roleLabel}
              </span>
            )}
            {candidate.driving_license && (
              <DrivingLicenseBadge license={candidate.driving_license} size="md" />
            )}
          </div>
          {(candidate.city || candidate.postal_code || candidate.street) && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
              {(candidate.city || candidate.postal_code) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                  <span className="text-gray-400">📍</span>
                  {[candidate.postal_code, candidate.city].filter(Boolean).join(" ")}
                </span>
              )}
              {candidate.street && <span className="text-gray-600">{candidate.street}</span>}
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-gray-400">{t("rolePosition")}</label>
              <div className="mt-1">
                <RoleDropdown
                  value={candidate.position_title}
                  roles={roles}
                  loading={rolesLoading}
                  onSelect={handleRoleSelect}
                  onCreateRole={onCreateRole}
                  onUpdateRole={onUpdateRoleMetadata}
                  onDeleteRole={onDeleteRole}
                  onRefreshRoles={onRefreshRoles}
                />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase text-gray-400">{t("city")}</label>
              <Input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                onBlur={handleAddressBlur}
                placeholder="e.g. Zürich"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-gray-400">{t("postalCode")}</label>
              <Input
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                onBlur={handleAddressBlur}
                placeholder="e.g. 8004"
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs uppercase text-gray-400">{t("street")}</label>
              <Input
                value={street}
                onChange={(event) => setStreet(event.target.value)}
                onBlur={handleAddressBlur}
                placeholder="e.g. Badenerstrasse 575"
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs uppercase text-gray-400">{t("phone")}</label>
              <div className="mt-1 flex gap-2">
                <Input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  onBlur={handlePhoneBlur}
                  placeholder="e.g. +41 79 123 45 67"
                  className="flex-1"
                />
                {phone && (
                  <a
                    href={`tel:${phone.replace(/\s+/g, "")}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 text-sm font-medium text-green-700 hover:bg-green-100 hover:border-green-300 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {t("call")}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Quality Status (A/B/C) */}
          {statusTags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {statusTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border bg-white/80 px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    color: TMA_STATUS_STYLES[tag].text,
                    borderColor: `${TMA_STATUS_STYLES[tag].border}60`,
                    backgroundColor: `${TMA_STATUS_STYLES[tag].bg}10`,
                  }}
                >
                  <span>{tag}</span>
                  <span className="text-gray-400">{TMA_STATUS_LABELS[tag]}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-400">{tQuality("notSet")}</span>
          )}
          {/* Activity Status (Active/Not Active) */}
          <Tag
            status={undefined}
            className="bg-gray-100 text-gray-500 border-gray-200"
            style={
              candidate.activity
                ? {
                    backgroundColor: `${TMA_ACTIVITY_STYLES[candidate.activity as TmaActivity].bg}20`,
                    color: TMA_ACTIVITY_STYLES[candidate.activity as TmaActivity].text,
                    borderColor: `${TMA_ACTIVITY_STYLES[candidate.activity as TmaActivity].border}50`,
                  }
                : undefined
            }
          >
            {candidate.activity ? tActivity(candidate.activity as TmaActivity) : tActivity("label")}
          </Tag>
        </div>
      </div>

      <div className="flex-1 px-6 py-6">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
          {/* Left column - Notes */}
          <div className="flex flex-col gap-6">
            <NotesPanel
              entityId={candidate.id}
              entityType="tma"
              legacyNotes={candidate.notes}
              onSaveLegacyNotes={onUpdateNotes}
              onNoteAdded={onNoteAdded}
            />
          </div>

          {/* Right column - Status, Activity, Documents */}
          <div className="flex flex-col gap-6">
            <Panel title={t("followUp")} description={t("followUpDescription")}>
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <p className="text-xs uppercase text-gray-400">{t("nextFollowUp")}</p>
                <p className="text-sm text-gray-900">
                  {candidate.follow_up_at ? formatFollowUp(candidate.follow_up_at) : t("noneScheduled")}
                </p>
                {candidate.follow_up_note && <p className="text-xs text-gray-400 mt-1">{candidate.follow_up_note}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleQuickFollowUp}>
                  {t("tomorrowAt")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsFollowUpModalOpen(true)}>
                  {t("custom")}
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title={t("quality")} description={t("qualityDescription")}>
            <div className="flex flex-wrap gap-2">
              {TMA_STATUS_LIST.map((status) => (
                <button
                  key={status}
                  onClick={() => onToggleStatusTag(status)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left text-sm transition",
                    statusTags.includes(status)
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                  )}
                >
                  <p className="font-medium">{TMA_STATUS_LABELS[status]}</p>
                </button>
              ))}
              {statusTags.length > 0 && (
                <button
                  onClick={onClearStatusTags}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600"
                >
                  {tCommon("clear")}
                </button>
              )}
            </div>
            {statusTags.length > 0 && (
              <div className="mt-3">
                <Input
                  value={qualityNote}
                  onChange={(e) => handleQualityNoteChange(e.target.value)}
                  placeholder="Warum diese Bewertung? (z.B. Gute Erfahrung, schnell verfügbar...)"
                  className="text-sm"
                />
              </div>
            )}
          </Panel>

          <Panel title={tActivity("label")} description={t("activityDescription")}>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onUpdateActivity("active")}
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm font-medium transition",
                  candidate.activity === "active"
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"
                )}
              >
                {tActivity("active")}
              </button>
              <button
                onClick={() => onUpdateActivity("inactive")}
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm font-medium transition",
                  candidate.activity === "inactive"
                    ? "border-gray-500 bg-gray-500 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                )}
              >
                {tActivity("inactive")}
              </button>
              {candidate.activity && (
                <button
                  onClick={onClearActivity}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600"
                >
                  {tCommon("clear")}
                </button>
              )}
            </div>
          </Panel>

          <Panel title={tDrivingLicense("label")} description={tDrivingLicense("candidateHas")}>
            <DrivingLicenseSelector 
              value={candidate.driving_license} 
              onChange={onUpdateDrivingLicense} 
            />
          </Panel>

          <Panel title="Berufserfahrung" description="Wie viele Jahre Erfahrung hat der Kandidat?">
            <ExperienceLevelSelector 
              value={candidate.experience_level} 
              onChange={onUpdateExperienceLevel} 
            />
          </Panel>

          <Panel title={t("documents")} description={t("documentsDescription")}>
            <div className="space-y-4">
              <DocumentCard
                title="CV"
                url={candidate.cv_url}
                uploading={uploading === "cv"}
                onUpload={(file) => handleUpload(file, "cv")}
              />
              <DocumentCard
                title="Zeugnisse"
                url={candidate.references_url}
                uploading={uploading === "references"}
                onUpload={(file) => handleUpload(file, "references")}
              />
              <DocumentCard
                title="Short Profile"
                url={candidate.short_profile_url}
                uploading={uploading === "short_profile"}
                onUpload={(file) => handleUpload(file, "short_profile")}
              />
            </div>
          </Panel>

          <Panel title="Vertragsunterlagen" description="Dokumente für Verträge">
            <div className="space-y-4">
              <DocumentCard
                title="AHV-Ausweis"
                url={candidate.ahv_url}
                uploading={uploading === "ahv"}
                onUpload={(file) => handleUpload(file, "ahv")}
              />
              <DocumentCard
                title="ID / Pass"
                url={candidate.id_url}
                uploading={uploading === "id"}
                onUpload={(file) => handleUpload(file, "id")}
              />
              <DocumentCard
                title="Bankkarte"
                url={candidate.bank_url}
                uploading={uploading === "bank"}
                onUpload={(file) => handleUpload(file, "bank")}
              />
            </div>
          </Panel>
        </div>
      </div>
      </div>

      <Modal open={isFollowUpModalOpen} onClose={() => setIsFollowUpModalOpen(false)}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("scheduleFollowUp")}</h3>
            <p className="text-sm text-gray-500">{t("reminderNote")}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-gray-400">{t("date")}</label>
              <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs uppercase text-gray-400">{t("time")}</label>
              <Input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-gray-400">{t("note")}</label>
            <Textarea value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} placeholder={t("reminderNote")} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsFollowUpModalOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleCustomFollowUp}>{t("saveFollowUp")}</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function DocumentCard({
  title,
  url,
  uploading,
  onUpload,
}: {
  title: string;
  url: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500">PDF, DOCX up to 5 MB</p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm text-blue-600">
          View document →
        </a>
      ) : (
        <p className="mt-2 text-xs text-gray-400">No file uploaded</p>
      )}
      <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-500 hover:text-gray-900">
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
          }}
        />
        {uploading ? "Uploading…" : "Upload"}
      </label>
    </div>
  );
}

function getTomorrowNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function getTomorrowISO() {
  return getTomorrowNine().toISOString().slice(0, 10);
}

function combineDateTime(date: string, time: string) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}:00`);
}

function formatFollowUp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}


