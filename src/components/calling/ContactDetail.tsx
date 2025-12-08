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
import { VacancyQuickView } from "./VacancyQuickView";
import type { Contact, Vacancy } from "@/lib/types";
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
  onNoteAdded?: () => void;
  vacancies?: Vacancy[];
  isMobile?: boolean;
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
  onNoteAdded,
  vacancies,
  isMobile = false,
}: ContactDetailProps) {
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [customDate, setCustomDate] = useState(() => getDefaultDateISO());
  const [customTime, setCustomTime] = useState("09:00");
  const [customNote, setCustomNote] = useState(contact?.follow_up_note ?? "");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null);
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
      <section className={cn(
        "flex flex-1 flex-col overflow-hidden",
        isMobile ? "p-4" : "p-6"
      )}>
        {/* Header - hidden on mobile (shown in CallingView header) */}
        {!isMobile && (
          <div className="flex items-center justify-between flex-shrink-0 mb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Now calling</p>
              <h1 className="text-2xl font-semibold text-gray-900">{contact.company_name}</h1>
              <p className="text-sm text-gray-500">{contact.contact_name ?? "Hiring Team"}</p>
            </div>
            <Tag status={contact.status} tone="muted" fallbackLabel="Set status" />
          </div>
        )}

        {/* Call panel - fixed */}
        <div className="flex-shrink-0 mb-4">
          <Panel
            title="Kontakt"
            description={isMobile ? undefined : "Anrufen oder E-Mail senden"}
            actions={
              !isMobile ? (
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
              ) : undefined
            }
          >
            <div className={cn(
              "grid gap-4 text-sm text-gray-600",
              isMobile ? "grid-cols-1" : "md:grid-cols-3"
            )}>
              <InfoBlock label="Phone" value={displayPhone} isMobile={isMobile} />
              <InfoBlock label="Email" value={displayEmail} isMobile={isMobile} />
              <InfoBlock label="Canton" isMobile={isMobile}>
                <CantonTag canton={contact.canton} size="md" />
              </InfoBlock>
            </div>
            {(contact.street || contact.city || contact.postal_code) && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span>
                  {[contact.street, contact.postal_code, contact.city].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
            {/* Mobile email button */}
            {isMobile && (
              <div className="mt-4">
                <Button 
                  onClick={handleOpenEmailPreview} 
                  size="lg" 
                  variant="secondary"
                  disabled={loadingPreview}
                  className="w-full"
                >
                  {loadingPreview ? "Laden..." : "E-Mail senden"}
                </Button>
              </div>
            )}
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

        {/* Vacancy Indicator */}
        {vacancies && vacancies.length > 0 && (
          <div className="flex-shrink-0 mb-4">
            <VacancyIndicator 
              vacancies={vacancies} 
              onViewDetails={(vacancy) => setSelectedVacancy(vacancy)} 
            />
          </div>
        )}

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
            onNoteAdded={onNoteAdded}
            contactForVacancy={{
              id: contact.id,
              company_name: contact.company_name,
              city: contact.city,
              postal_code: contact.postal_code,
              latitude: contact.latitude,
              longitude: contact.longitude,
              team_id: contact.team_id,
            }}
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

      {/* Vacancy Quick View Popup */}
      <VacancyQuickView
        vacancy={selectedVacancy}
        isOpen={!!selectedVacancy}
        onClose={() => setSelectedVacancy(null)}
      />
    </>
  );
});

// Vacancy Indicator component
const VacancyIndicator = memo(function VacancyIndicator({
  vacancies,
  onViewDetails,
}: {
  vacancies: Vacancy[];
  onViewDetails: (vacancy: Vacancy) => void;
}) {
  // Sort by urgency (highest first)
  const sortedVacancies = [...vacancies].sort((a, b) => (b.urgency || 1) - (a.urgency || 1));
  const mostUrgent = sortedVacancies[0];

  return (
    <button
      onClick={() => onViewDetails(mostUrgent)}
      className="w-full rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-left transition-colors hover:bg-purple-100 hover:border-purple-300 group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600 group-hover:bg-purple-200">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
              <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-purple-900">
              {vacancies.length === 1 ? "Offene Vakanz" : `${vacancies.length} Offene Vakanzen`}
            </p>
            <p className="text-xs text-purple-600">{mostUrgent.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Urgency flames */}
          <div className="flex gap-0.5">
            {Array.from({ length: mostUrgent.urgency || 1 }).map((_, i) => (
              <svg key={i} className="w-3.5 h-3.5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 23c-4.97 0-9-3.58-9-8 0-2.52 1.17-4.83 3.15-6.42.9-.73 1.85-1.27 2.85-1.58.39-.12.8.16.8.57v.44c0 1.08.22 2.14.65 3.12.15.36.55.48.87.27.17-.11.32-.24.45-.39.72-.8 1.14-1.82 1.23-2.9.09-1.08-.12-2.17-.63-3.14-.25-.47.18-1.02.7-.89 1.76.45 3.38 1.38 4.72 2.73C19.32 8.92 21 11.87 21 15c0 4.42-4.03 8-9 8z"/>
              </svg>
            ))}
          </div>
          <svg className="w-4 h-4 text-purple-400 group-hover:text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  );
});

const InfoBlock = memo(function InfoBlock({
  label,
  value,
  children,
  isMobile = false,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  isMobile?: boolean;
}) {
  // Make phone and email tappable on mobile
  const isPhone = label.toLowerCase() === "phone" && value && !value.includes("No ");
  const isEmail = label.toLowerCase() === "email" && value && !value.includes("No ");
  
  return (
    <div className={isMobile ? "flex items-center justify-between py-2 border-b border-gray-100" : ""}>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      {children ? (
        <div className={isMobile ? "" : "mt-1"}>{children}</div>
      ) : isPhone && isMobile ? (
        <a href={`tel:${value?.replace(/\s+/g, "")}`} className="text-sm text-blue-600 font-medium">
          {value}
        </a>
      ) : isEmail && isMobile ? (
        <a href={`mailto:${value}`} className="text-sm text-blue-600 font-medium truncate max-w-[200px]">
          {value}
        </a>
      ) : (
        <p className={cn("text-sm text-gray-900", isMobile ? "" : "mt-1")}>{value}</p>
      )}
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
