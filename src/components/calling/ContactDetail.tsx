"use client";

import { memo, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import type { Contact } from "@/lib/types";
import type { ContactStatus } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

interface ContactDetailProps {
  contact: Contact | null;
  onCall: () => void;
  onNext: () => void;
  onSaveNotes: (value: string | null) => Promise<void>;
  notesRef: React.RefObject<HTMLTextAreaElement | null>;
  actionMessage?: string | null;
  onUpdateStatus: (status: ContactStatus) => Promise<void> | void;
  onScheduleFollowUp: (args: { date: Date; note?: string }) => Promise<void> | void;
  onClearFollowUp: () => Promise<void> | void;
  onClearStatus: () => Promise<void> | void;
}

export const ContactDetail = memo(function ContactDetail({
  contact,
  onCall,
  onNext,
  onSaveNotes,
  notesRef,
  actionMessage,
  onUpdateStatus,
  onScheduleFollowUp,
  onClearFollowUp,
  onClearStatus,
}: ContactDetailProps) {
  const [notesValue, setNotesValue] = useState(contact?.notes ?? "");
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [customDate, setCustomDate] = useState(() => getDefaultDateISO());
  const [customTime, setCustomTime] = useState("09:00");
  const [customNote, setCustomNote] = useState(contact?.follow_up_note ?? "");

  const displayPhone = contact?.phone ?? "No phone number";
  const displayEmail = contact?.email ?? "No email";
  const followUpDate = contact?.follow_up_at ? new Date(contact.follow_up_at) : null;

  const handleNotesChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotesValue(event.target.value);
  }, []);

  const handleAutoSave = useCallback(
    async (value: string) => {
      await onSaveNotes(value.trim().length ? value : null);
    },
    [onSaveNotes]
  );

  const handleQuickFollowUp = useCallback(async () => {
    const target = getTomorrowNine();
    await onScheduleFollowUp({ date: target, note: contact?.follow_up_note ?? undefined });
  }, [contact?.follow_up_note, onScheduleFollowUp]);

  const handleCustomFollowUp = useCallback(async () => {
    const date = combineDateTime(customDate, customTime);
    if (!date) return;
    await onScheduleFollowUp({ date, note: customNote.trim() || undefined });
    setIsFollowUpModalOpen(false);
  }, [customDate, customTime, customNote, onScheduleFollowUp]);

  if (!contact) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
        Select a company to start calling.
      </div>
    );
  }

  return (
    <>
      <section className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Now calling</p>
            <h1 className="text-2xl font-semibold text-gray-900">{contact.company_name}</h1>
            <p className="text-sm text-gray-500">{contact.contact_name ?? "Hiring Team"}</p>
          </div>
          <Tag status={contact.status} tone="muted" fallbackLabel="Set status" />
        </div>

        <Panel
          title="Call"
          description="Press C to call instantly"
          actions={
            <Button onClick={onCall} size="lg">
              Call {contact.contact_name?.split(" ")[0] ?? ""}
            </Button>
          }
        >
          <div className="grid gap-4 text-sm text-gray-600 md:grid-cols-3">
            <InfoBlock label="Phone" value={displayPhone} />
            <InfoBlock label="Email" value={displayEmail} />
            <InfoBlock label="Canton">
              <CantonTag canton={contact.canton} size="md" />
            </InfoBlock>
          </div>
        </Panel>

        <Panel title="Status" description="Control lead heat & follow-ups">
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <StatusButton
                key={option.value}
                label={option.label}
                description={option.description}
                active={contact.status === option.value}
                onClick={() => onUpdateStatus(option.value)}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-xs text-gray-500 hover:text-gray-900"
            onClick={onClearStatus}
            disabled={!contact.status}
          >
            Clear status
          </Button>
          <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-600">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Follow-up</p>
                <p className="text-sm text-gray-900">
                  {followUpDate ? formatFollowUpDate(followUpDate) : "No follow-up scheduled"}
                </p>
                {contact.follow_up_note && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{contact.follow_up_note}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={handleQuickFollowUp}>
                  Tomorrow · 09:00
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsFollowUpModalOpen(true)}>
                  Custom…
                </Button>
                {followUpDate && (
                  <Button size="sm" variant="ghost" onClick={onClearFollowUp}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Notes" description="Autosaves every few seconds" className="flex-1">
          <Textarea
            ref={notesRef}
            value={notesValue}
            onChange={handleNotesChange}
            onAutoSave={handleAutoSave}
            autosaveDelay={800}
            placeholder="Add context, objections, next steps..."
            className="min-h-[200px]"
          />
        </Panel>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {actionMessage ?? "J/K to move • C to call • 1-5 outcomes • N focus notes"}
          </div>
          <Button variant="ghost" onClick={onNext}>
            Next Company ↵
          </Button>
        </div>
      </section>

      <Modal open={isFollowUpModalOpen} onClose={() => setIsFollowUpModalOpen(false)}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Schedule follow-up</h3>
            <p className="text-sm text-gray-500">
              Pick when this company should reappear in your follow-up list.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-gray-400">Date</label>
              <Input type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} />
            </div>
            <div>
              <label className="text-xs uppercase text-gray-400">Time</label>
              <Input type="time" value={customTime} onChange={(event) => setCustomTime(event.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-gray-400">Note</label>
            <Textarea value={customNote} onChange={(event) => setCustomNote(event.target.value)} placeholder="Optional context" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsFollowUpModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCustomFollowUp}>Save follow-up</Button>
          </div>
        </div>
      </Modal>
    </>
  );
});

const InfoBlock = memo(function InfoBlock({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      {children ? <div className="mt-1">{children}</div> : <p className="text-sm text-gray-900">{value}</p>}
    </div>
  );
});

const STATUS_OPTIONS: Array<{
  value: ContactStatus;
  label: string;
  description: string;
}> = [
  { value: "hot", label: "Hot", description: "High intent – call ASAP" },
  { value: "working", label: "Working", description: "Currently being handled" },
  { value: "follow_up", label: "Follow Up", description: "Waiting for future touch" },
];

function StatusButton({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border px-4 py-3 text-left text-sm transition-all duration-150",
        active
          ? "border-gray-900 bg-gray-900 text-white shadow-sm"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
      )}
    >
      <p className="font-medium">{label}</p>
      <p className="text-xs text-gray-400">{description}</p>
    </button>
  );
}

function getTomorrowNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function getDefaultDateISO() {
  const dt = getTomorrowNine();
  return dt.toISOString().slice(0, 10);
}

function combineDateTime(date: string, time: string) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}:00`);
}

function formatFollowUpDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
