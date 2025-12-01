"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { NotesPanel } from "@/components/calling/NotesPanel";
import type { TmaCandidate } from "@/lib/types";
import { TMA_STATUS_LIST, TMA_STATUS_LABELS, TMA_STATUS_STYLES, type TmaStatus } from "@/lib/utils/constants";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

interface Props {
  candidate: TmaCandidate | null;
  onUpdateStatus: (status: TmaStatus) => Promise<void> | void;
  onClearStatus: () => Promise<void> | void;
  onScheduleFollowUp: (args: { date: Date; note?: string }) => Promise<void> | void;
  onUpdateNotes: (value: string | null) => Promise<void>;
  onUpdateDocuments: (
    payload: { cv_url?: string | null; references_url?: string | null; short_profile_url?: string | null }
  ) => Promise<void>;
  onUpdatePosition: (value: string | null) => Promise<void> | void;
}

export function TmaDetail({
  candidate,
  onUpdateStatus,
  onClearStatus,
  onScheduleFollowUp,
  onUpdateNotes,
  onUpdateDocuments,
  onUpdatePosition,
}: Props) {
  const initialFollowUpDate = candidate?.follow_up_at ? new Date(candidate.follow_up_at) : null;
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(
    initialFollowUpDate ? initialFollowUpDate.toISOString().slice(0, 10) : getTomorrowISO()
  );
  const [followUpTime, setFollowUpTime] = useState(
    initialFollowUpDate ? initialFollowUpDate.toISOString().slice(11, 16) : "09:00"
  );
  const [followUpNote, setFollowUpNote] = useState(candidate?.follow_up_note ?? "");
  const [uploading, setUploading] = useState<"cv" | "references" | "short_profile" | null>(null);
  const [position, setPosition] = useState(() => candidate?.position_title ?? "");
  const handlePositionBlur = useCallback(async () => {
    if (!candidate) return;
    const trimmed = position.trim();
    if (trimmed === (candidate.position_title?.trim() ?? "")) return;
    await onUpdatePosition(trimmed.length ? trimmed : null);
  }, [candidate, onUpdatePosition, position]);

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
    async (file: File, type: "cv" | "references" | "short_profile") => {
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

  if (!candidate) {
    return (
      <section className="flex flex-1 items-center justify-center text-sm text-gray-500">
        Select a candidate to view details.
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
    <section className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
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
              </>
            ) : (
              <span className="text-xs text-orange-600 font-medium">
                Unclaimed
              </span>
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
              <button
                onClick={() => {
                  if (phoneLink) window.open(`tel:${phoneLink}`, "_self");
                }}
                className="inline-flex rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:border-gray-400"
              >
                Call {candidate.phone}
              </button>
            )}
            {candidate.canton && <CantonTag canton={candidate.canton} size="md" />}
          </div>
          <div className="mt-3 max-w-sm">
            <label className="text-xs uppercase text-gray-400">Role / Position</label>
            <Input
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              onBlur={handlePositionBlur}
              placeholder="e.g. Montage-Elektriker"
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Tag
            status={undefined}
            className="bg-gray-100 text-gray-500 border-gray-200"
            style={
              candidate.status
                ? {
                    backgroundColor: `${TMA_STATUS_STYLES[candidate.status as TmaStatus].bg}20`,
                    color: TMA_STATUS_STYLES[candidate.status as TmaStatus].text,
                    borderColor: `${TMA_STATUS_STYLES[candidate.status as TmaStatus].border}50`,
                  }
                : undefined
            }
          >
            {candidate.status ? TMA_STATUS_LABELS[candidate.status as TmaStatus] : "Set status"}
          </Tag>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={onClearStatus}
            disabled={!candidate.status}
          >
            Clear status
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-6 px-6 py-6 md:grid-cols-[minmax(0,1fr)_320px] overflow-hidden min-h-0">
        <div className="flex h-full flex-col gap-6 overflow-hidden min-h-0">
          <NotesPanel
            entityId={candidate.id}
            entityType="tma"
            legacyNotes={candidate.notes}
            onSaveLegacyNotes={onUpdateNotes}
          />
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Follow-up" description="Stay on top of next actions">
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <p className="text-xs uppercase text-gray-400">Next follow-up</p>
                <p className="text-sm text-gray-900">
                  {candidate.follow_up_at ? formatFollowUp(candidate.follow_up_at) : "None scheduled"}
                </p>
                {candidate.follow_up_note && <p className="text-xs text-gray-400 mt-1">{candidate.follow_up_note}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleQuickFollowUp}>
                  Tomorrow · 09:00
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsFollowUpModalOpen(true)}>
                  Custom…
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title="Status" description="Categorize candidate quality">
            <div className="flex flex-wrap gap-2">
              {TMA_STATUS_LIST.map((status) => (
                <button
                  key={status}
                  onClick={() => onUpdateStatus(status)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left text-sm transition",
                    candidate.status === status
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                  )}
                >
                  <p className="font-medium">{TMA_STATUS_LABELS[status]}</p>
                  <p className="text-xs text-gray-400">
                    {status === "A" ? "Ready to deploy" : status === "B" ? "Active pipeline" : "Keep warm"}
                  </p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Documents" description="Upload CV and Zeugnisse">
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
        </div>
      </div>

      <Modal open={isFollowUpModalOpen} onClose={() => setIsFollowUpModalOpen(false)}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Schedule follow-up</h3>
            <p className="text-sm text-gray-500">Choose a specific date and time to revisit this candidate.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-gray-400">Date</label>
              <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs uppercase text-gray-400">Time</label>
              <Input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-gray-400">Note</label>
            <Textarea value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} placeholder="Reminder for future you" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsFollowUpModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCustomFollowUp}>Save follow-up</Button>
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


