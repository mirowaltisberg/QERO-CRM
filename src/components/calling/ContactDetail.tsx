"use client";

import { memo, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NotesPanel } from "./NotesPanel";
import type { Contact } from "@/lib/types";
import type { ContactStatus } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

interface ContactDetailProps {
  contact: Contact | null;
  onCall: () => void;
  onNext: () => void;
  onSaveNotes: (value: string | null) => Promise<void>;
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
  actionMessage,
  onUpdateStatus,
  onScheduleFollowUp,
  onClearFollowUp,
  onClearStatus,
}: ContactDetailProps) {
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [customDate, setCustomDate] = useState(() => getDefaultDateISO());
  const [customTime, setCustomTime] = useState("09:00");
  const [customNote, setCustomNote] = useState(contact?.follow_up_note ?? "");

  const displayPhone = contact?.phone ?? "No phone number";
  const displayEmail = contact?.email ?? "No email";
  const followUpDate = contact?.follow_up_at ? new Date(contact.follow_up_at) : null;

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

        {/* Compact status + follow-up toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="text-xs text-gray-400 mr-1">Status</span>
          <Button
            size="sm"
            variant={contact.status === "working" ? "secondary" : "ghost"}
            className={cn(
              "text-xs",
              contact.status === "working" && "bg-gray-900 text-white hover:bg-gray-800"
            )}
            onClick={() => onUpdateStatus("working")}
          >
            Working
          </Button>
          <Button
            size="sm"
            variant={contact.status === "hot" ? "secondary" : "ghost"}
            className={cn(
              "text-xs",
              contact.status === "hot" && "bg-orange-500 text-white hover:bg-orange-600"
            )}
            onClick={() => onUpdateStatus("hot")}
          >
            Hot
          </Button>
          {contact.status && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-gray-400 hover:text-gray-700"
              onClick={onClearStatus}
            >
              ✕
            </Button>
          )}

          <div className="mx-2 h-4 w-px bg-gray-200" />

          <span className="text-xs text-gray-400 mr-1">Follow-up</span>
          <FollowUpDropdown
            currentDate={followUpDate}
            onSelect={(preset) => {
              if (preset === "custom") {
                setIsFollowUpModalOpen(true);
              } else if (preset === "tomorrow9") {
                onScheduleFollowUp({ date: getTomorrowNine(), note: contact.follow_up_note ?? undefined });
              } else if (preset === "today5") {
                onScheduleFollowUp({ date: getTodayFive(), note: contact.follow_up_note ?? undefined });
              }
            }}
            onClear={onClearFollowUp}
          />
        </div>

        <NotesPanel
          contactId={contact.id}
          legacyNotes={contact.notes}
          onSaveLegacyNotes={onSaveNotes}
        />

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

function FollowUpDropdown({
  currentDate,
  onSelect,
  onClear,
}: {
  currentDate: Date | null;
  onSelect: (preset: "tomorrow9" | "today5" | "custom") => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        className="text-xs"
        onClick={() => setOpen((prev) => !prev)}
      >
        {currentDate ? formatFollowUpDate(currentDate) : "Set"} ▾
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <button
              className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100"
              onClick={() => {
                onSelect("tomorrow9");
                setOpen(false);
              }}
            >
              Tomorrow 9 AM
            </button>
            <button
              className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100"
              onClick={() => {
                onSelect("today5");
                setOpen(false);
              }}
            >
              Today 5 PM
            </button>
            <button
              className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100"
              onClick={() => {
                onSelect("custom");
                setOpen(false);
              }}
            >
              Custom…
            </button>
            {currentDate && (
              <>
                <div className="my-1 border-t border-gray-100" />
                <button
                  className="w-full px-3 py-2 text-left text-xs text-red-500 hover:bg-gray-100"
                  onClick={() => {
                    onClear();
                    setOpen(false);
                  }}
                >
                  Clear follow-up
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function getTomorrowNine() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function getTodayFive() {
  const date = new Date();
  date.setHours(17, 0, 0, 0);
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
