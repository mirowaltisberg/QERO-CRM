"use client";

import { memo, useCallback, useState, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CantonTag } from "@/components/ui/CantonTag";
import { ContactPersonsPanel } from "./ContactPersonsPanel";
import { TravelTimeWidget } from "./TravelTimeWidget";
import { VacancyQuickView } from "./VacancyQuickView";
import { CandidatePickerModal } from "./CandidatePickerModal";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { QuickVacancyPopup } from "./QuickVacancyPopup";
import { createClient } from "@/lib/supabase/client";
import type { Contact, Vacancy, TmaCandidate, ContactNote } from "@/lib/types";
import type { ContactStatus } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

// ============================================================================
// Types
// ============================================================================

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
  selectedCandidate?: TmaCandidate | null;
}

interface AttachmentInfo {
  name: string;
  type: "candidate" | "agb";
  error?: string;
}

type EmailSentState = { status: "success" | "warning" | "error"; message: string };

// ============================================================================
// Main Component
// ============================================================================

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
  selectedCandidate = null,
}: ContactDetailProps) {
  const t = useTranslations("contact");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const tTma = useTranslations("tma");
  const tEmail = useTranslations("email");

  // Inspector state
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Quick vacancy popup
  const [showVacancyPopup, setShowVacancyPopup] = useState(false);
  const lastTriggerRef = useRef("");

  // Follow-up modal
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [customDate, setCustomDate] = useState(() => getDefaultDateISO());
  const [customTime, setCustomTime] = useState("09:00");
  const [customNote, setCustomNote] = useState(contact?.follow_up_note ?? "");

  // Email state
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState<EmailSentState | null>(null);
  const [emailPreview, setEmailPreview] = useState<{
    recipients: string[];
    subject: string;
    body: string;
    attachments: AttachmentInfo[];
    hasAttachment: boolean;
    candidateErrors: boolean;
    canSend: boolean;
  } | null>(null);
  const [emailCandidates, setEmailCandidates] = useState<TmaCandidate[]>([]);
  const [editableSubject, setEditableSubject] = useState("");
  const [editableBody, setEditableBody] = useState("");
  const [showCandidatePicker, setShowCandidatePicker] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generatingAi, setGeneratingAi] = useState<"standard" | "best" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeDraftType, setActiveDraftType] = useState<"standard" | "best">("standard");
  const [researchConfidence, setResearchConfidence] = useState<"high" | "medium" | "low" | null>(null);

  // Vacancy quick view
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null);

  // More menu
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const followUpDate = contact?.follow_up_at ? new Date(contact.follow_up_at) : null;

  // ============================================================================
  // Effects
  // ============================================================================

  // Initialize email candidates with selected candidate
  useEffect(() => {
    if (selectedCandidate) {
      setEmailCandidates([selectedCandidate]);
    } else {
      setEmailCandidates([]);
    }
  }, [selectedCandidate]);

  // Reset custom note when contact changes
  useEffect(() => {
    setCustomNote(contact?.follow_up_note ?? "");
  }, [contact?.follow_up_note]);

  // Keyboard shortcuts for Inspector and Focus mode
  useEffect(() => {
    if (isMobile) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.key === "i") {
        e.preventDefault();
        setInspectorOpen((prev) => !prev);
      }
      if (e.key === "f") {
        e.preventDefault();
        setFocusMode((prev) => !prev);
      }
      if (e.key === "n") {
        e.preventDefault();
        composerRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile]);

  // Pre-generate draft when candidate is selected
  useEffect(() => {
    if (!selectedCandidate || !contact) return;
    const preGenerate = async () => {
      try {
        await fetch("/api/email-draft/standard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId: selectedCandidate.id, companyId: contact.id }),
        });
      } catch { /* silent */ }
    };
    preGenerate();
  }, [selectedCandidate, contact]);

  // Fetch notes
  useEffect(() => {
    if (!contact?.id) {
      setNotes([]);
      return;
    }
    setNotesLoading(true);
    fetch(`/api/contacts/${contact.id}/notes`)
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setNotes(data.data);
      })
      .catch(console.error)
      .finally(() => setNotesLoading(false));
  }, [contact?.id]);

  // Real-time notes subscription
  useEffect(() => {
    if (!contact?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notes-contact-${contact.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contact_notes", filter: `contact_id=eq.${contact.id}` },
        async () => {
          const res = await fetch(`/api/contacts/${contact.id}/notes`);
          if (res.ok) {
            const json = await res.json();
            if (json.data) setNotes(json.data);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [contact?.id]);

  // Detect "sucht:" trigger
  useEffect(() => {
    if (!contact) return;
    const lower = newNote.toLowerCase();
    if (lower.endsWith("sucht:") && lastTriggerRef.current !== newNote) {
      lastTriggerRef.current = newNote;
      setShowVacancyPopup(true);
    }
  }, [newNote, contact]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSubmitNote = useCallback(async () => {
    if (!contact?.id || !newNote.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setNotes((prev) => [data.data, ...prev]);
        setNewNote("");
        onNoteAdded?.();
      }
    } catch (err) {
      console.error("Failed to add note:", err);
    } finally {
      setSubmittingNote(false);
    }
  }, [contact?.id, newNote, onNoteAdded]);

  const handleNoteKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmitNote();
    }
  }, [handleSubmitNote]);

  const handleVacancyCreated = useCallback(() => {
    if (newNote.toLowerCase().endsWith("sucht:")) {
      setNewNote(newNote.slice(0, -6).trimEnd());
    }
    lastTriggerRef.current = "";
  }, [newNote]);

  const handleCustomFollowUp = useCallback(async () => {
    const date = combineDateTime(customDate, customTime);
    if (!date) return;
    await onScheduleFollowUp({ date, note: customNote.trim() || undefined });
    setIsFollowUpModalOpen(false);
  }, [customDate, customTime, customNote, onScheduleFollowUp]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  // Email handlers (same as before, abbreviated)
  const handleOpenEmailPreview = useCallback(async () => {
    if (!contact) return;
    setLoadingPreview(true);
    setEmailSent(null);
    setActiveDraftType("standard");
    setResearchConfidence(null);
    try {
      const candidateIds = emailCandidates.map((c) => c.id).join(",");
      const url = `/api/contacts/${contact.id}/send-email${candidateIds ? `?candidateIds=${candidateIds}` : ""}`;
      const response = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Vorschau konnte nicht geladen werden");
      setEmailPreview({
        recipients: json.data.recipients,
        subject: json.data.subject,
        body: json.data.bodyHtml,
        attachments: json.data.attachments || [],
        hasAttachment: json.data.hasAttachment,
        candidateErrors: json.data.candidateErrors || false,
        canSend: json.data.canSend !== false,
      });
      const candidateForDraft = emailCandidates[0];
      if (candidateForDraft) {
        setGeneratingAi("standard");
        try {
          const draftResponse = await fetch("/api/email-draft/standard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidateId: candidateForDraft.id, companyId: contact.id }),
          });
          const draftJson = await draftResponse.json();
          if (draftResponse.ok && draftJson.data?.body) {
            setEditableSubject(draftJson.data.subject || json.data.subject);
            setEditableBody(draftJson.data.body);
          } else {
            setEditableSubject(json.data.subject);
            setEditableBody(json.data.bodyText);
          }
        } catch { setEditableSubject(json.data.subject); setEditableBody(json.data.bodyText); }
        finally { setGeneratingAi(null); }
      } else {
        setEditableSubject(json.data.subject);
        setEditableBody(json.data.bodyText);
      }
    } catch (err) {
      setEmailSent({ status: "error", message: err instanceof Error ? err.message : "Vorschau konnte nicht geladen werden" });
    } finally {
      setLoadingPreview(false);
    }
  }, [contact, emailCandidates]);

  const handleSendEmail = useCallback(async () => {
    if (!contact) return;
    setSendingEmail(true);
    try {
      const response = await fetch(`/api/contacts/${contact.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: emailCandidates.map((c) => c.id), subject: editableSubject, body: editableBody }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "E-Mail konnte nicht gesendet werden");
      const { recipients = [], failedRecipients = [] } = json.data;
      const hasFailures = failedRecipients.length > 0;
      setEmailSent({
        status: hasFailures ? (recipients.length > 0 ? "warning" : "error") : "success",
        message: hasFailures ? `⚠️ ${recipients.length}/${recipients.length + failedRecipients.length} gesendet` : `✅ E-Mail gesendet an ${recipients.length} Empfänger`,
      });
      if (!hasFailures) setEmailPreview(null);
    } catch (err) {
      setEmailSent({ status: "error", message: err instanceof Error ? err.message : "E-Mail konnte nicht gesendet werden" });
    } finally {
      setSendingEmail(false);
    }
  }, [contact, emailCandidates, editableSubject, editableBody]);

  const handleRemoveCandidate = useCallback((candidateId: string) => {
    setEmailCandidates((prev) => prev.filter((c) => c.id !== candidateId));
  }, []);

  const handleAddCandidate = useCallback((candidate: TmaCandidate) => {
    setEmailCandidates((prev) => prev.some((c) => c.id === candidate.id) ? prev : [...prev, candidate]);
    setShowCandidatePicker(false);
  }, []);

  const handleGenerateStandard = useCallback(async () => {
    if (!contact || !emailCandidates[0]) return;
    setGeneratingAi("standard");
    setAiError(null);
    try {
      const response = await fetch("/api/email-draft/standard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: emailCandidates[0].id, companyId: contact.id }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setEditableSubject(json.data.subject);
      setEditableBody(json.data.body);
      setActiveDraftType("standard");
    } catch (err) { setAiError(err instanceof Error ? err.message : "Error"); }
    finally { setGeneratingAi(null); }
  }, [contact, emailCandidates]);

  const handleGenerateBest = useCallback(async () => {
    if (!contact || !emailCandidates[0]) return;
    setGeneratingAi("best");
    setAiError(null);
    try {
      const response = await fetch("/api/email-draft/best", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: emailCandidates[0].id, companyId: contact.id }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setEditableSubject(json.data.subject);
      setEditableBody(json.data.body);
      setActiveDraftType("best");
      setResearchConfidence(json.data.confidence || null);
    } catch (err) { setAiError(err instanceof Error ? err.message : "Error"); }
    finally { setGeneratingAi(null); }
  }, [contact, emailCandidates]);

  // Group notes by date
  const groupedNotes = useMemo(() => {
    const groups: { label: string; notes: ContactNote[] }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const getLabel = (dateStr: string) => {
      const d = new Date(dateStr);
      if (d.toDateString() === today.toDateString()) return "Today";
      if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    notes.forEach((note) => {
      const label = getLabel(note.created_at);
      const existing = groups.find((g) => g.label === label);
      if (existing) existing.notes.push(note);
      else groups.push({ label, notes: [note] });
    });
    return groups;
  }, [notes]);

  // ============================================================================
  // Render
  // ============================================================================

  if (!contact) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
        {t("selectContact")}
      </div>
    );
  }

  const hasVacancies = vacancies && vacancies.length > 0;
  const showTravelTime = selectedCandidate?.latitude && selectedCandidate?.longitude && contact.latitude && contact.longitude;

  return (
    <>
      <div className={cn("flex flex-1 h-full overflow-hidden", isMobile ? "flex-col" : "flex-row")}>
        {/* Main Notes Workspace */}
        <div className={cn(
          "flex flex-col flex-1 min-w-0 transition-all duration-200",
          inspectorOpen && !isMobile ? "mr-80" : ""
        )}>
          {/* Title Bar - Minimal */}
          {!isMobile && !focusMode && (
            <header className="flex items-center justify-between px-8 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <div className="min-w-0">
                  <h1 className="text-xl font-medium text-gray-900 truncate">{contact.company_name}</h1>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    {contact.canton && <CantonTag canton={contact.canton} size="sm" />}
                    <span className="truncate">{contact.contact_name ?? "Hiring Team"}</span>
                  </div>
                </div>
              </div>

              {/* Toolbar - icon-first */}
              <div className="flex items-center gap-1">
                {/* Call - primary accent */}
                <button
                  onClick={onCall}
                  className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors"
                  title="Call (C)"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 01.85-.25 11.36 11.36 0 003.55.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.55 1 1 0 01-.25.85l-2.2 2.2z" />
                  </svg>
                  Anrufen
                </button>

                {/* Next - secondary */}
                <button
                  onClick={onNext}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Next (↵)"
                >
                  Weiter
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>

                {/* Divider */}
                <div className="h-6 w-px bg-gray-200 mx-1" />

                {/* Inspector toggle */}
                <button
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                  className={cn(
                    "rounded-lg p-2 transition-colors",
                    inspectorOpen ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                  )}
                  title="Toggle Inspector (I)"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                </button>

                {/* More menu */}
                <div className="relative">
                  <button
                    onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                  </button>
                  {moreMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMoreMenuOpen(false)} />
                      <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        <button
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          onClick={() => { handleOpenEmailPreview(); setMoreMenuOpen(false); }}
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          E-Mail senden
                        </button>
                        {contact.phone && (
                          <button
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            onClick={() => { copyToClipboard(contact.phone!); setMoreMenuOpen(false); }}
                          >
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                            </svg>
                            Telefon kopieren
                          </button>
                        )}
                        <button
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          onClick={() => { setFocusMode(!focusMode); setMoreMenuOpen(false); }}
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                          </svg>
                          {focusMode ? "Fokus aus" : "Fokus Modus"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </header>
          )}

          {/* Focus mode minimal header */}
          {!isMobile && focusMode && (
            <header className="flex items-center justify-between px-8 py-3 border-b border-gray-100 flex-shrink-0">
              <span className="text-sm font-medium text-gray-900">{contact.company_name}</span>
              <div className="flex items-center gap-2">
                <button onClick={onCall} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600">
                  Anrufen
                </button>
                <button onClick={() => setFocusMode(false)} className="text-xs text-gray-400 hover:text-gray-600">
                  Fokus aus
                </button>
              </div>
            </header>
          )}

          {/* Notes Canvas */}
          <div className="flex-1 overflow-auto">
            <div className={cn(
              "mx-auto py-6",
              focusMode ? "max-w-2xl px-4" : "max-w-3xl px-8"
            )}>
              {/* Composer - borderless, integrated */}
              <div className="mb-8">
                <textarea
                  ref={composerRef}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={handleNoteKeyDown}
                  placeholder="Notiz schreiben... (⌘+Enter zum Speichern)"
                  className="w-full resize-none border-0 bg-transparent text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 leading-relaxed min-h-[100px]"
                  style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
                />
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    {newNote.trim() && `${newNote.trim().length} Zeichen`}
                  </span>
                  <button
                    onClick={handleSubmitNote}
                    disabled={!newNote.trim() || submittingNote}
                    className={cn(
                      "text-sm transition-colors",
                      newNote.trim()
                        ? "text-blue-600 hover:text-blue-700"
                        : "text-gray-300 cursor-not-allowed"
                    )}
                  >
                    {submittingNote ? "Speichern..." : "Speichern"}
                  </button>
                </div>
              </div>

              {/* Notes Timeline */}
              {notesLoading ? (
                <div className="text-sm text-gray-400 text-center py-8">Notizen werden geladen...</div>
              ) : groupedNotes.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">Keine Notizen vorhanden</div>
              ) : (
                <div className="space-y-6">
                  {groupedNotes.map((group) => (
                    <div key={group.label}>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                        {group.label}
                      </div>
                      <div className="space-y-4">
                        {group.notes.map((note) => (
                          <NoteRow key={note.id} note={note} contactId={contact.id} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer - minimal */}
          {!focusMode && !isMobile && (
            <footer className="flex items-center justify-between px-8 py-3 border-t border-gray-100 text-xs text-gray-400 flex-shrink-0">
              <span>{actionMessage ?? "J/K navigieren • C anrufen • I Inspektor"}</span>
              <span>{notes.length} {notes.length === 1 ? "Notiz" : "Notizen"}</span>
            </footer>
          )}
        </div>

        {/* Inspector Panel - Right Drawer */}
        {inspectorOpen && !isMobile && !focusMode && (
          <aside className="w-80 border-l border-gray-100 bg-gray-50/50 overflow-y-auto flex-shrink-0 fixed right-0 top-0 bottom-0">
            <div className="p-4 space-y-6">
              {/* Actions */}
              <InspectorSection title="Aktionen">
                <div className="space-y-1">
                  <InspectorButton
                    icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>}
                    label="E-Mail senden"
                    onClick={handleOpenEmailPreview}
                    loading={loadingPreview}
                  />
                  {contact.phone && (
                    <InspectorButton
                      icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>}
                      label={`Telefon kopieren (${contact.phone})`}
                      onClick={() => copyToClipboard(contact.phone!)}
                    />
                  )}
                </div>
              </InspectorSection>

              {/* Status & Follow-up */}
              <InspectorSection title="Status & Follow-up">
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => onUpdateStatus("working")}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md transition-colors",
                      contact.status === "working" ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    {tStatus("working")}
                  </button>
                  <button
                    onClick={() => onUpdateStatus("hot")}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md transition-colors",
                      contact.status === "hot" ? "bg-orange-500 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    {tStatus("hot")}
                  </button>
                  {contact.status && (
                    <button onClick={onClearStatus} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600">✕</button>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Follow-up:</span>
                  {followUpDate ? (
                    <span className="text-xs font-medium text-blue-600">{formatFollowUpDate(followUpDate)}</span>
                  ) : (
                    <span className="text-xs text-gray-400">Nicht gesetzt</span>
                  )}
                  <button
                    onClick={() => setIsFollowUpModalOpen(true)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    {followUpDate ? "Ändern" : "Setzen"}
                  </button>
                  {followUpDate && (
                    <button onClick={onClearFollowUp} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                  )}
                </div>
              </InspectorSection>

              {/* Contact Info */}
              <InspectorSection title="Kontakt">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Telefon</span>
                    <span className="text-gray-900">{contact.phone || "–"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">E-Mail</span>
                    <span className="text-gray-900 truncate max-w-[160px]">{contact.email || "–"}</span>
                  </div>
                  {(contact.street || contact.city) && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Adresse</span>
                      <span className="text-gray-900 text-right text-xs">
                        {[contact.street, contact.postal_code, contact.city].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </InspectorSection>

              {/* Contact Persons */}
              <InspectorSection title="Ansprechpersonen">
                <ContactPersonsPanel contactId={contact.id} compact />
              </InspectorSection>

              {/* Vacancies */}
              {hasVacancies && (
                <InspectorSection title="Vakanzen">
                  <div className="space-y-1">
                    {vacancies!.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVacancy(v)}
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white text-sm text-gray-700 flex items-center justify-between"
                      >
                        <span className="truncate">{v.title}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: v.urgency || 1 }).map((_, i) => (
                            <svg key={i} className="w-2.5 h-2.5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 23c-4.97 0-9-3.58-9-8 0-2.52 1.17-4.83 3.15-6.42.9-.73 1.85-1.27 2.85-1.58.39-.12.8.16.8.57v.44c0 1.08.22 2.14.65 3.12.15.36.55.48.87.27.17-.11.32-.24.45-.39.72-.8 1.14-1.82 1.23-2.9.09-1.08-.12-2.17-.63-3.14-.25-.47.18-1.02.7-.89 1.76.45 3.38 1.38 4.72 2.73C19.32 8.92 21 11.87 21 15c0 4.42-4.03 8-9 8z"/>
                            </svg>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </InspectorSection>
              )}

              {/* Travel Time */}
              {showTravelTime && (
                <InspectorSection title="Fahrzeit">
                  <TravelTimeWidget
                    fromLat={selectedCandidate!.latitude!}
                    fromLng={selectedCandidate!.longitude!}
                    toLat={contact.latitude!}
                    toLng={contact.longitude!}
                    candidateName={`${selectedCandidate!.first_name} ${selectedCandidate!.last_name}`}
                    companyName={contact.company_name}
                  />
                </InspectorSection>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Modals */}
      <Modal open={isFollowUpModalOpen} onClose={() => setIsFollowUpModalOpen(false)}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{tTma("scheduleFollowUp")}</h3>
            <p className="text-sm text-gray-500">Wann soll diese Firma wieder erscheinen?</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-gray-400">Datum</label>
              <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs uppercase text-gray-400">Zeit</label>
              <Input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-gray-400">Notiz</label>
            <Textarea value={customNote} onChange={(e) => setCustomNote(e.target.value)} placeholder="Optional" />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { onScheduleFollowUp({ date: getTomorrowNine() }); setIsFollowUpModalOpen(false); }}
              className="flex-1 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Morgen 9:00
            </button>
            <button
              onClick={() => { onScheduleFollowUp({ date: getTodayFive() }); setIsFollowUpModalOpen(false); }}
              className="flex-1 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Heute 17:00
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsFollowUpModalOpen(false)}>{tCommon("cancel")}</Button>
            <Button onClick={handleCustomFollowUp}>{tTma("saveFollowUp")}</Button>
          </div>
        </div>
      </Modal>

      {/* Email Modal - same structure as before */}
      <Modal open={emailPreview !== null} onClose={() => setEmailPreview(null)}>
        <div className="space-y-4 max-w-2xl">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{tEmail("preview")}</h3>
              <p className="text-sm text-gray-500">{tEmail("previewDescription")}</p>
            </div>
            {emailCandidates.length > 0 && (
              <div className="flex gap-2">
                <button type="button" onClick={handleGenerateStandard} disabled={!!generatingAi}
                  className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    generatingAi === "standard" ? "bg-gray-200 text-gray-500 cursor-wait" : activeDraftType === "standard" ? "bg-gray-200 text-gray-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}>
                  {generatingAi === "standard" ? <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : <span>⚡</span>}
                  {tEmail("draftStandard")}
                </button>
                <button type="button" onClick={handleGenerateBest} disabled={!!generatingAi}
                  className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    generatingAi === "best" ? "bg-purple-200 text-purple-500 cursor-wait" : activeDraftType === "best" ? "bg-purple-600 text-white" : "bg-gradient-to-r from-purple-500 to-indigo-500 text-white")}>
                  {generatingAi === "best" ? <span className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /> : <span>🔍</span>}
                  {tEmail("draftBest")}
                </button>
              </div>
            )}
          </div>
          {aiError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{aiError}</div>}
          {activeDraftType === "best" && researchConfidence && (
            <div className={cn("rounded-lg border px-3 py-2 text-sm",
              researchConfidence === "high" ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
              {tEmail("researchConfidence")}: {tEmail(`confidence${researchConfidence.charAt(0).toUpperCase() + researchConfidence.slice(1)}`)}
            </div>
          )}
          {emailPreview && (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase text-gray-400">{tEmail("recipients")}</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {emailPreview.recipients.map((email, i) => (
                      <span key={i} className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">{email}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400">{tEmail("subject")}</label>
                  <Input className="mt-1" value={editableSubject} onChange={(e) => setEditableSubject(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400">{tEmail("message")}</label>
                  <div className="relative mt-1">
                    <Textarea className={cn("min-h-[150px] font-mono text-xs", generatingAi && "opacity-30")} value={editableBody} onChange={(e) => setEditableBody(e.target.value)} disabled={!!generatingAi} />
                    {generatingAi && (
                      <div className="absolute inset-0 pointer-events-none rounded-md bg-white/80 backdrop-blur-[1px] flex items-start p-4">
                        <TextShimmer className="text-sm font-medium" duration={1.5}>
                          {generatingAi === "best" ? tEmail("generatingBest") : tEmail("generatingStandard")}
                        </TextShimmer>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs uppercase text-gray-400">{tEmail("attachments")}</label>
                    <button type="button" onClick={() => setShowCandidatePicker(true)} className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100">
                      + {tEmail("addCandidate")}
                    </button>
                  </div>
                  <div className="mt-2 space-y-1">
                    {emailPreview.attachments.map((att, i) => (
                      <div key={i} className={cn("flex items-center justify-between rounded-lg border px-3 py-2", att.error ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50")}>
                        <span className={cn("text-sm", att.error ? "text-red-700" : "text-gray-700")}>{att.name}</span>
                        {att.type === "candidate" && (
                          <button onClick={() => { const name = att.name.replace("KP - ", "").replace(".pdf", ""); const c = emailCandidates.find((x) => `${x.first_name} ${x.last_name}` === name); if (c) handleRemoveCandidate(c.id); }} className="text-gray-400 hover:text-gray-600">✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {emailSent && <div className={cn("rounded-lg px-3 py-2 text-sm", emailSent.status === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>{emailSent.message}</div>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEmailPreview(null)} disabled={sendingEmail}>{tCommon("cancel")}</Button>
                <Button onClick={handleSendEmail} disabled={sendingEmail || emailSent?.status === "success"}>{sendingEmail ? tEmail("sending") : tEmail("send")}</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <CandidatePickerModal open={showCandidatePicker} onClose={() => setShowCandidatePicker(false)} onSelect={handleAddCandidate} />
      <VacancyQuickView vacancy={selectedVacancy} isOpen={!!selectedVacancy} onClose={() => setSelectedVacancy(null)} />
      {contact && (
        <QuickVacancyPopup
          isOpen={showVacancyPopup}
          onClose={() => { setShowVacancyPopup(false); lastTriggerRef.current = ""; }}
          contact={{ id: contact.id, company_name: contact.company_name, city: contact.city, postal_code: contact.postal_code, latitude: contact.latitude, longitude: contact.longitude, team_id: contact.team_id }}
          onCreated={handleVacancyCreated}
        />
      )}
    </>
  );
});

// ============================================================================
// Sub-components
// ============================================================================

const NoteRow = memo(function NoteRow({ note, contactId }: { note: ContactNote; contactId: string }) {
  const [hovering, setHovering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(note.content);
  const [saving, setSaving] = useState(false);

  const author = note.author;
  const initials = author?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "??";

  const handleSave = async () => {
    if (!editValue.trim() || editValue.trim() === note.content) { setEditing(false); return; }
    setSaving(true);
    try {
      await fetch(`/api/contacts/${contactId}/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editValue.trim() }),
      });
      setEditing(false);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <div
      className="group"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="flex items-start gap-3">
        {/* Avatar - subtle */}
        <div className="h-6 w-6 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
          {author?.avatar_url ? (
            <Image src={author.avatar_url} alt={author.full_name || "User"} width={24} height={24} unoptimized className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-gray-400">{initials}</div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="font-medium text-gray-600">{author?.full_name?.split(" ")[0] || "Unknown"}</span>
            <span>·</span>
            <span>{formatRelativeTime(note.created_at)}</span>
            {hovering && !editing && (
              <button onClick={() => setEditing(true)} className="ml-auto text-gray-400 hover:text-gray-600">Edit</button>
            )}
          </div>
          {editing ? (
            <div className="mt-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700" disabled={saving}>Cancel</button>
                <button onClick={handleSave} className="text-xs text-blue-600 hover:text-blue-700" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
          )}
        </div>
      </div>
    </div>
  );
});

const InspectorSection = memo(function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{title}</div>
      {children}
    </div>
  );
});

const InspectorButton = memo(function InspectorButton({
  icon, label, onClick, loading
}: { icon: React.ReactNode; label: string; onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-700 hover:bg-white transition-colors"
    >
      <span className="text-gray-400">{icon}</span>
      <span className="truncate">{loading ? "Laden..." : label}</span>
    </button>
  );
});

// ============================================================================
// Helpers
// ============================================================================

function getTomorrowNine() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function getTodayFive() {
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  return d;
}

function getDefaultDateISO() {
  return getTomorrowNine().toISOString().slice(0, 10);
}

function combineDateTime(date: string, time: string) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}:00`);
}

function formatFollowUpDate(date: Date) {
  return new Intl.DateTimeFormat("de-CH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "jetzt";
  if (diffMins < 60) return `vor ${diffMins}m`;
  if (diffHours < 24) return `vor ${diffHours}h`;
  if (diffDays < 7) return `vor ${diffDays}d`;
  return date.toLocaleDateString("de-CH", { month: "short", day: "numeric" });
}
