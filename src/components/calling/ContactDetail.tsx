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
import { ContactPersonsPanel } from "./ContactPersonsPanel";
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
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState<{ success: boolean; message: string } | null>(null);
  const [emailPreview, setEmailPreview] = useState<{
    recipients: string[];
    subject: string;
    body: string;
    hasAttachment: boolean;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const displayPhone = contact?.phone ?? "No phone number";
  const displayEmail = contact?.email ?? "No email";
  const followUpDate = contact?.follow_up_at ? new Date(contact.follow_up_at) : null;

  const handleCustomFollowUp = useCallback(async () => {
    const date = combineDateTime(customDate, customTime);
    if (!date) return;
    await onScheduleFollowUp({ date, note: customNote.trim() || undefined });
    setIsFollowUpModalOpen(false);
  }, [customDate, customTime, customNote, onScheduleFollowUp]);

  const handleOpenEmailPreview = useCallback(async () => {
    if (!contact) return;
    setLoadingPreview(true);
    setEmailSent(null);
    try {
      const response = await fetch(`/api/contacts/${contact.id}/send-email?preview=1`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Vorschau konnte nicht geladen werden");
      }
      setEmailPreview({
        recipients: json.data.recipients,
        subject: json.data.subject,
        body: json.data.body,
        hasAttachment: json.data.hasAttachment,
      });
    } catch (err) {
      setEmailSent({
        success: false,
        message: err instanceof Error ? err.message : "Vorschau konnte nicht geladen werden",
      });
    } finally {
      setLoadingPreview(false);
    }
  }, [contact]);

  const handleSendEmail = useCallback(async () => {
    if (!contact) return;
    setSendingEmail(true);
    try {
      const response = await fetch(`/api/contacts/${contact.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "E-Mail konnte nicht gesendet werden");
      }
      setEmailSent({
        success: true,
        message: `E-Mail gesendet an: ${json.data.recipients.join(", ")}`,
      });
      setEmailPreview(null);
    } catch (err) {
      setEmailSent({
        success: false,
        message: err instanceof Error ? err.message : "E-Mail konnte nicht gesendet werden",
      });
    } finally {
      setSendingEmail(false);
    }
  }, [contact]);

  if (!contact) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
        Select a company to start calling.
      </div>
    );
  }

  return (
    <>
      <section className="flex flex-1 flex-col p-6 overflow-hidden">
        {/* Header - fixed */}
        <div className="flex items-center justify-between flex-shrink-0 mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Now calling</p>
            <h1 className="text-2xl font-semibold text-gray-900">{contact.company_name}</h1>
            <p className="text-sm text-gray-500">{contact.contact_name ?? "Hiring Team"}</p>
          </div>
          <Tag status={contact.status} tone="muted" fallbackLabel="Set status" />
        </div>

        {/* Call panel - fixed */}
        <div className="flex-shrink-0 mb-4">
          <Panel
            title="Kontakt"
            description="Anrufen oder E-Mail senden"
            actions={
              <div className="flex gap-2">
                <Button onClick={onCall} size="lg">
                  Anrufen
                </Button>
                <Button 
                  onClick={handleOpenEmailPreview} 
                  size="lg" 
                  variant="secondary"
                  disabled={loadingPreview}
                >
                  {loadingPreview ? "Laden..." : "E-Mail senden"}
                </Button>
              </div>
            }
          >
            <div className="grid gap-4 text-sm text-gray-600 md:grid-cols-3">
              <InfoBlock label="Phone" value={displayPhone} />
              <InfoBlock label="Email" value={displayEmail} />
              <InfoBlock label="Canton">
                <CantonTag canton={contact.canton} size="md" />
              </InfoBlock>
            </div>
            {emailSent && (
              <div className={cn(
                "mt-3 rounded-lg px-3 py-2 text-sm",
                emailSent.success 
                  ? "bg-green-50 text-green-700 border border-green-200" 
                  : "bg-red-50 text-red-600 border border-red-200"
              )}>
                {emailSent.message}
              </div>
            )}
          </Panel>
        </div>

        {/* Contact persons */}
        <div className="flex-shrink-0 mb-4">
          <ContactPersonsPanel contactId={contact.id} />
        </div>

        {/* Compact status + follow-up toolbar - fixed */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 flex-shrink-0 mb-4">
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

        {/* Notes panel - takes remaining space and scrolls */}
        <div className="flex-1 min-h-0 overflow-hidden mb-4">
          <NotesPanel
            entityId={contact.id}
            entityType="contact"
            legacyNotes={contact.notes}
            onSaveLegacyNotes={onSaveNotes}
          />
        </div>

        {/* Footer - fixed */}
        <div className="flex items-center justify-between flex-shrink-0">
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

      {/* Email Preview Modal */}
      <Modal open={emailPreview !== null} onClose={() => setEmailPreview(null)}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">E-Mail Vorschau</h3>
            <p className="text-sm text-gray-500">Überprüfe die E-Mail bevor du sie versendest.</p>
          </div>
          
          {emailPreview && (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase text-gray-400">Empfänger</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {emailPreview.recipients.map((email, i) => (
                      <span key={i} className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400">Betreff</label>
                  <p className="mt-1 text-sm font-medium text-gray-900">{emailPreview.subject}</p>
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400">Nachricht</label>
                  <div 
                    className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"
                    dangerouslySetInnerHTML={{ __html: emailPreview.body }}
                  />
                </div>
                {emailPreview.hasAttachment && (
                  <div>
                    <label className="text-xs uppercase text-gray-400">Anhang</label>
                    <div className="mt-1 flex items-center gap-2 text-sm text-gray-700">
                      <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      AGB QERO AG.pdf
                    </div>
                  </div>
                )}
              </div>

              {emailSent && (
                <div className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  emailSent.success 
                    ? "bg-green-50 text-green-700 border border-green-200" 
                    : "bg-red-50 text-red-600 border border-red-200"
                )}>
                  {emailSent.message}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEmailPreview(null)} disabled={sendingEmail}>
                  Abbrechen
                </Button>
                <Button onClick={handleSendEmail} disabled={sendingEmail || emailSent?.success}>
                  {sendingEmail ? "Senden..." : emailSent?.success ? "Gesendet ✓" : "Senden"}
                </Button>
              </div>
            </>
          )}
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
