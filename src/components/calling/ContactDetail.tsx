"use client";

import { memo, useCallback, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { NotesPanel } from "./NotesPanel";
import { ContactPersonsPanel } from "./ContactPersonsPanel";
import { TravelTimeWidget } from "./TravelTimeWidget";

type EmailSentState = { status: "success" | "warning" | "error"; message: string };
import { VacancyQuickView } from "./VacancyQuickView";
import { CandidatePickerModal } from "./CandidatePickerModal";
import { CandidateMatchModal } from "./CandidateMatchModal";
import { TeamCandidatesModal } from "./TeamCandidatesModal";
import { TextShimmer } from "@/components/ui/text-shimmer";
import type { Contact, Vacancy, TmaCandidate, ContactPerson } from "@/lib/types";
import type { ContactStatus } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";

// Attachment info returned from API
interface AttachmentInfo {
  name: string;
  type: "candidate" | "agb";
  error?: string;
}

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
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [customDate, setCustomDate] = useState(() => getDefaultDateISO());
  const [customTime, setCustomTime] = useState("09:00");
  const [customNote, setCustomNote] = useState(contact?.follow_up_note ?? "");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState<EmailSentState | null>(null);
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  // Contact persons state
  const [contactPersonsOpen, setContactPersonsOpen] = useState(false);
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>([]);
  const [contactPersonsLoading, setContactPersonsLoading] = useState(false);
  
  // Fetch contact persons when contact changes
  useEffect(() => {
    if (!contact?.id) {
      setContactPersons([]);
      return;
    }
    
    const fetchContactPersons = async () => {
      setContactPersonsLoading(true);
      try {
        const response = await fetch(`/api/contacts/${contact.id}/persons`, { cache: "no-store" });
        const json = await response.json();
        if (response.ok && json.data) {
          setContactPersons(json.data);
        }
      } catch (err) {
        console.error("Error fetching contact persons:", err);
      } finally {
        setContactPersonsLoading(false);
      }
    };
    
    fetchContactPersons();
    
    // Set up realtime subscription for contact persons
    const supabase = createClient();
    const channel = supabase
      .channel(`contact-persons-inline-${contact.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contact_persons",
          filter: `contact_id=eq.${contact.id}`,
        },
        () => {
          // Refetch on any change
          fetchContactPersons();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [contact?.id]);
  
  // Email compose state
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
  const [showCandidateMatch, setShowCandidateMatch] = useState(false);
  const [showTeamCandidates, setShowTeamCandidates] = useState(false);
  const [generatingAi, setGeneratingAi] = useState<"standard" | "best" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeDraftType, setActiveDraftType] = useState<"standard" | "best">("standard");
  const [researchConfidence, setResearchConfidence] = useState<"high" | "medium" | "low" | null>(null);

  // Initialize emailCandidates with selectedCandidate when it changes
  useEffect(() => {
    if (selectedCandidate) {
      setEmailCandidates([selectedCandidate]);
    } else {
      setEmailCandidates([]);
    }
  }, [selectedCandidate]);

  // Pre-generate standard draft in background when candidate is selected
  useEffect(() => {
    if (!selectedCandidate || !contact) return;

    // Fire and forget - pre-generate standard draft
    const preGenerateDraft = async () => {
      try {
        console.log(`[Pre-generate] Starting for candidate ${selectedCandidate.id} -> company ${contact.id}`);
        await fetch("/api/email-draft/standard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateId: selectedCandidate.id,
            companyId: contact.id,
          }),
        });
        console.log("[Pre-generate] Standard draft cached");
      } catch (err) {
        console.error("[Pre-generate] Failed:", err);
        // Silent fail - will generate when user opens email modal
      }
    };

    preGenerateDraft();
  }, [selectedCandidate, contact]);

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
    setActiveDraftType("standard");
    setResearchConfidence(null);
    
    try {
      // Build URL with candidate IDs
      const candidateIds = emailCandidates.map((c) => c.id).join(",");
      const url = `/api/contacts/${contact.id}/send-email${candidateIds ? `?candidateIds=${candidateIds}` : ""}`;
      
      const response = await fetch(url, {
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
        body: json.data.bodyHtml, // Full HTML with signature for preview display
        attachments: json.data.attachments || [],
        hasAttachment: json.data.hasAttachment,
        candidateErrors: json.data.candidateErrors || false,
        canSend: json.data.canSend !== false,
      });
      
      // Auto-fetch standard draft if we have a candidate
      const candidateForDraft = emailCandidates[0];
      if (candidateForDraft) {
        setGeneratingAi("standard");
        try {
          const draftResponse = await fetch("/api/email-draft/standard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              candidateId: candidateForDraft.id,
              companyId: contact.id,
            }),
          });
          const draftJson = await draftResponse.json();
          if (draftResponse.ok && draftJson.data?.body) {
            setEditableSubject(draftJson.data.subject || json.data.subject);
            setEditableBody(draftJson.data.body);
            setActiveDraftType("standard");
          } else {
            // Fallback to default body
            setEditableSubject(json.data.subject);
            setEditableBody(json.data.bodyText);
          }
        } catch {
          // Fallback to default body
          setEditableSubject(json.data.subject);
          setEditableBody(json.data.bodyText);
        } finally {
          setGeneratingAi(null);
        }
      } else {
        setEditableSubject(json.data.subject);
        setEditableBody(json.data.bodyText);
      }
    } catch (err) {
      setEmailSent({
        status: "error",
        message: err instanceof Error ? err.message : "Vorschau konnte nicht geladen werden",
      });
    } finally {
      setLoadingPreview(false);
    }
  }, [contact, emailCandidates]);

  const handleSendEmail = useCallback(async () => {
    if (!contact) return;
    setSendingEmail(true);
    try {
      const candidateIds = emailCandidates.map((c) => c.id);
      const response = await fetch(`/api/contacts/${contact.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds,
          subject: editableSubject,
          body: editableBody,
        }),
      });
      const json = await response.json();
      
      if (!response.ok) {
        // Include debug info in error message if available
        let errorMsg = json.error || "E-Mail konnte nicht gesendet werden";
        if (json.details?.debugInfo) {
          const dbg = json.details.debugInfo;
          console.log("[Email Send Debug]", dbg);
          errorMsg += `\n\n📋 Debug: ${dbg.contactPersonsCount} Kontaktperson(en) gefunden`;
          if (dbg.contactPersons?.length > 0) {
            errorMsg += `: ${dbg.contactPersons.map((p: { name: string; email: string }) => 
              `${p.name} (${p.email})`).join(", ")}`;
          }
        }
        throw new Error(errorMsg);
      }
      
      // Build message with attempted/sent/failed
      const { recipients = [], failedRecipients = [], attemptedRecipients = [], debugInfo } = json.data;
      console.log("[Email Send Success]", { recipients, failedRecipients, attemptedRecipients, debugInfo });
      
      const sentCount = recipients.length;
      const failedCount = failedRecipients?.length || 0;
      const attemptedCount = attemptedRecipients?.length || sentCount + failedCount;
      const hasFailures = failedCount > 0;
      const status: EmailSentState["status"] = hasFailures
        ? sentCount > 0
          ? "warning"
          : "error"
        : "success";

      const sentLine = sentCount > 0 ? `Gesendet: ${recipients.join(", ")}` : "Gesendet: –";
      const attemptedLine =
        attemptedRecipients && attemptedRecipients.length > 0
          ? `Versucht: ${attemptedRecipients.map((a: { email: string; name?: string }) => a.name ? `${a.name} <${a.email}>` : a.email).join(", ")}`
          : undefined;
      const failedLine =
        failedCount > 0
          ? `Fehlgeschlagen: ${failedRecipients
              .map((f: { email: string; error: string }) => `${f.email} (${f.error})`)
              .join(", ")}`
          : undefined;

      let message = hasFailures
        ? `⚠️ ${sentCount}/${attemptedCount} E-Mails gesendet.\n${sentLine}`
        : `✅ E-Mail gesendet an ${sentCount} Empfänger:\n${recipients.join(", ")}`;

      if (attemptedLine) {
        message += `\n${attemptedLine}`;
      }
      if (failedLine) {
        message += `\n${failedLine}`;
      }
      
      setEmailSent({
        status,
        message,
      });
      if (status === "success") {
        setEmailPreview(null);
      }
    } catch (err) {
      setEmailSent({
        status: "error",
        message: err instanceof Error ? err.message : "E-Mail konnte nicht gesendet werden",
      });
    } finally {
      setSendingEmail(false);
    }
  }, [contact, emailCandidates, editableSubject, editableBody]);

  // Remove a candidate from the email attachments
  const handleRemoveCandidate = useCallback((candidateId: string) => {
    setEmailCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    // Update local attachments list
    setEmailPreview((prev) => {
      if (!prev) return prev;
      const candidate = emailCandidates.find((c) => c.id === candidateId);
      if (!candidate) return prev;
      const fileName = `KP - ${candidate.first_name} ${candidate.last_name}.pdf`;
      const newAttachments = prev.attachments.filter((a) => a.name !== fileName);
      return {
        ...prev,
        attachments: newAttachments,
        candidateErrors: newAttachments.some((a) => a.type === "candidate" && a.error),
        canSend: !newAttachments.some((a) => a.type === "candidate" && a.error),
      };
    });
  }, [emailCandidates]);

  // Add a candidate from the picker
  const handleAddCandidate = useCallback((candidate: TmaCandidate) => {
    setEmailCandidates((prev) => {
      // Don't add duplicates
      if (prev.some((c) => c.id === candidate.id)) return prev;
      return [...prev, candidate];
    });
    // Add to local attachments list (optimistic - will be validated on send)
    setEmailPreview((prev) => {
      if (!prev) return prev;
      const fileName = `KP - ${candidate.first_name} ${candidate.last_name}.pdf`;
      // Check if already in attachments
      if (prev.attachments.some((a) => a.name === fileName)) return prev;
      // Add new candidate attachment before AGB
      const agbIndex = prev.attachments.findIndex((a) => a.type === "agb");
      const newAttachment: AttachmentInfo = {
        name: fileName,
        type: "candidate",
        // Optimistically assume profile exists - will be validated on send
        error: candidate.short_profile_url ? undefined : "Kein Kurzprofil vorhanden",
      };
      const newAttachments = [...prev.attachments];
      if (agbIndex >= 0) {
        newAttachments.splice(agbIndex, 0, newAttachment);
      } else {
        newAttachments.push(newAttachment);
      }
      return {
        ...prev,
        attachments: newAttachments,
        candidateErrors: newAttachments.some((a) => a.type === "candidate" && a.error),
        canSend: !newAttachments.some((a) => a.type === "candidate" && a.error),
      };
    });
    setShowCandidatePicker(false);
  }, []);

  // Generate standard draft (cached, no web research)
  const handleGenerateStandard = useCallback(async () => {
    if (!contact) return;
    
    const candidateForDraft = emailCandidates[0];
    if (!candidateForDraft) {
      setAiError(tEmail("aiNoCandidateError"));
      return;
    }

    setGeneratingAi("standard");
    setAiError(null);
    setEditableBody("");

    try {
      const response = await fetch("/api/email-draft/standard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidateForDraft.id,
          companyId: contact.id,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || tEmail("aiError"));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      setEditableSubject(json.data.subject);
      setEditableBody(json.data.body);
      setActiveDraftType("standard");
      setResearchConfidence(null);
    } catch (err) {
      console.error("Standard draft error:", err);
      setAiError(err instanceof Error ? err.message : tEmail("aiError"));
    } finally {
      setGeneratingAi(null);
    }
  }, [contact, emailCandidates, tEmail]);

  // Generate best draft (with web research)
  const handleGenerateBest = useCallback(async () => {
    if (!contact) return;
    
    const candidateForDraft = emailCandidates[0];
    if (!candidateForDraft) {
      setAiError(tEmail("aiNoCandidateError"));
      return;
    }

    setGeneratingAi("best");
    setAiError(null);
    setEditableBody("");

    try {
      const response = await fetch("/api/email-draft/best", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidateForDraft.id,
          companyId: contact.id,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || tEmail("aiError"));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      setEditableSubject(json.data.subject);
      setEditableBody(json.data.body);
      setActiveDraftType("best");
      setResearchConfidence(json.data.confidence || null);
    } catch (err) {
      console.error("Best draft error:", err);
      setAiError(err instanceof Error ? err.message : tEmail("aiError"));
    } finally {
      setGeneratingAi(null);
    }
  }, [contact, emailCandidates, tEmail]);

  // Status options for segmented control
  const statusOptions = [
    { value: "working" as const, label: tStatus("working"), color: "rgb(17 24 39)" },
    { value: "hot" as const, label: tStatus("hot"), color: "rgb(249 115 22)" },
  ];

  if (!contact) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
        {t("selectContact")}
      </div>
    );
  }

  // Mobile layout
  if (isMobile) {
    return (
      <>
        <section className="flex flex-1 flex-col overflow-hidden p-4">
          {/* Compact Info Cards */}
          <div className="flex-shrink-0 space-y-3 mb-4">
            {/* Phone & Email Row */}
            <div className="flex gap-2">
              {contact.phone && !contact.phone.includes("No ") && (
                <a
                  href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700 truncate">{contact.phone}</span>
                </a>
              )}
              {contact.email && !contact.email.includes("No ") && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700 truncate">{contact.email}</span>
                </a>
              )}
            </div>

            {/* Status & Follow-up Row */}
            <div className="flex items-center gap-3">
              <SegmentedControl
                options={statusOptions}
                value={contact.status as ContactStatus | null}
                onChange={(val) => val ? onUpdateStatus(val) : onClearStatus()}
                allowDeselect
              />
              <FollowUpChip
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
          </div>

          {/* Notes Panel - Takes all remaining space */}
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

          {/* Bottom Action Bar */}
          <div className="flex-shrink-0 space-y-3">
            {/* Contact Persons Row - show as cards */}
            {contactPersons.length > 0 ? (
              <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
                {contactPersons.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => setContactPersonsOpen(true)}
                    className="flex-shrink-0 flex flex-col items-start px-3 py-2 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/80"
                  >
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-900">
                        {person.first_name} {person.last_name}
                      </span>
                    </div>
                    {person.role && (
                      <span className="text-xs text-gray-500 mt-0.5 ml-5">{person.role}</span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setContactPersonsOpen(true)}
                  className="flex-shrink-0 flex items-center justify-center w-12 h-full min-h-[48px] rounded-xl bg-gray-50 border border-dashed border-gray-300 text-gray-400"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setContactPersonsOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium text-gray-500 bg-gray-50 border border-dashed border-gray-300"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Ansprechperson hinzufügen
              </button>
            )}
            
            {/* Actions Row */}
            <div className="flex items-center gap-3">
              <Button 
                onClick={handleOpenEmailPreview} 
                variant="secondary"
                disabled={loadingPreview}
                className="flex-1"
              >
                {loadingPreview ? "Laden..." : "E-Mail senden"}
              </Button>
            </div>
          </div>
        </section>

        {/* Modals and Drawers */}
        {renderModalsAndDrawers()}
      </>
    );
  }

  // Desktop layout - Apple-native redesign
  return (
    <>
      <section className="flex flex-1 flex-col overflow-hidden">
        {/* ========== FROSTED HEADER ========== */}
        <header className="flex-shrink-0 sticky top-0 z-20 backdrop-blur-xl bg-white/80 border-b border-gray-100">
          <div className="px-6 py-4">
            {/* Top row: Company name + Status */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-gray-900 truncate">
                  {contact.company_name}
                </h1>
                <p className="text-sm text-gray-500 truncate">
                  {contact.contact_name ?? "Hiring Team"}
                </p>
              </div>
              
              {/* Status Segmented Control */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <SegmentedControl
                  options={statusOptions}
                  value={contact.status as ContactStatus | null}
                  onChange={(val) => val ? onUpdateStatus(val) : onClearStatus()}
                  allowDeselect
                />
                <FollowUpChip
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
            </div>

            {/* Bottom row: Info chips + Actions */}
            <div className="flex items-center justify-between gap-4">
              {/* Info Chips */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Phone chip */}
                <InfoChip 
                  icon={<PhoneIcon />}
                  label={displayPhone}
                  href={contact.phone && !contact.phone.includes("No ") ? `tel:${contact.phone.replace(/\s+/g, "")}` : undefined}
                />
                
                {/* Email chip */}
                <InfoChip 
                  icon={<EmailIcon />}
                  label={displayEmail}
                  href={contact.email && !contact.email.includes("No ") ? `mailto:${contact.email}` : undefined}
                />
                
                {/* Canton chip */}
                <CantonTag canton={contact.canton} size="sm" />
                
                {/* Location chip */}
                {(contact.street || contact.city) && (
                  <InfoChip 
                    icon={<LocationIcon />}
                    label={[contact.street, contact.postal_code, contact.city].filter(Boolean).join(", ")}
                  />
                )}
                
                {/* Ansprechpersonen - show as cards if they exist */}
                {contactPersonsLoading ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 bg-gray-50">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : contactPersons.length > 0 ? (
                  // Show contact persons as clear cards with name + role
                  <div className="flex items-center gap-2">
                    {contactPersons.map((person) => (
                      <button
                        key={person.id}
                        onClick={() => setContactPersonsOpen(true)}
                        className={cn(
                          "flex flex-col items-start px-3 py-2 rounded-xl text-left",
                          "bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100",
                          "border border-blue-100/80 transition-all duration-150",
                          "shadow-sm hover:shadow"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-900">
                            {person.first_name} {person.last_name}
                          </span>
                        </div>
                        {person.role && (
                          <span className="text-xs text-gray-500 mt-0.5 ml-5">
                            {person.role}
                          </span>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => setContactPersonsOpen(true)}
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-xl",
                        "bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300",
                        "text-gray-400 hover:text-gray-600 transition-colors"
                      )}
                      title="Ansprechperson hinzufügen"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  // No contact persons - show add button
                  <button
                    onClick={() => setContactPersonsOpen(true)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium",
                      "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors",
                      "border border-dashed border-gray-300"
                    )}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Ansprechperson hinzufügen
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button onClick={onCall} size="md" className="shadow-sm">
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Anrufen
                </Button>
                <Button 
                  onClick={handleOpenEmailPreview} 
                  variant="secondary"
                  size="md"
                  disabled={loadingPreview}
                  className="shadow-sm"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {loadingPreview ? "Laden..." : "E-Mail"}
                </Button>
                <Button 
                  onClick={() => selectedCandidate ? setShowTeamCandidates(true) : undefined} 
                  variant="secondary"
                  size="md"
                  className="shadow-sm"
                  disabled={!selectedCandidate}
                  title={selectedCandidate ? t("teamCandidatesTitle") : t("selectCandidateFirst")}
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Kandidaten
                </Button>
              </div>
            </div>
          </div>
          
          {/* Travel Time Widget - inline in header when candidate selected */}
          {selectedCandidate?.latitude && selectedCandidate?.longitude && 
           contact.latitude && contact.longitude && (
            <div className="px-6 pb-3 border-t border-gray-100/50 pt-3">
              <TravelTimeWidget
                fromLat={selectedCandidate.latitude}
                fromLng={selectedCandidate.longitude}
                toLat={contact.latitude}
                toLng={contact.longitude}
                candidateName={`${selectedCandidate.first_name} ${selectedCandidate.last_name}`}
                companyName={contact.company_name}
                className="flex-row items-center gap-4"
              />
            </div>
          )}
          
          {/* Vacancy Indicator - compact in header */}
          {vacancies && vacancies.length > 0 && (
            <VacancyBanner 
              vacancies={vacancies} 
              onViewDetails={(vacancy) => setSelectedVacancy(vacancy)} 
            />
          )}
        </header>

        {/* ========== MAIN CONTENT: NOTES ========== */}
        <div className="flex-1 min-h-0 overflow-hidden p-6">
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

        {/* ========== FOOTER ========== */}
        <footer className="flex-shrink-0 px-6 py-3 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">
              {actionMessage ?? "J/K to move • C to call • 1-5 outcomes • N focus notes"}
            </div>
            <Button variant="ghost" onClick={onNext} size="sm">
              Next Company ↵
            </Button>
          </div>
        </footer>
      </section>

      {/* Modals and Drawers */}
      {renderModalsAndDrawers()}
    </>
  );

  // Helper function to render all modals/drawers (shared between layouts)
  function renderModalsAndDrawers() {
    return (
      <>
        {/* Contact Persons Drawer */}
        <Sheet open={contactPersonsOpen} onOpenChange={setContactPersonsOpen}>
          <SheetContent className="w-full sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>Ansprechpersonen</SheetTitle>
              <SheetDescription>
                Kontaktpersonen bei {contact?.company_name}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              {contact && <ContactPersonsPanel contactId={contact.id} />}
            </div>
          </SheetContent>
        </Sheet>

        {/* Follow-up Modal */}
        <Modal open={isFollowUpModalOpen} onClose={() => setIsFollowUpModalOpen(false)}>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{tTma("scheduleFollowUp")}</h3>
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
                {tCommon("cancel")}
              </Button>
              <Button onClick={handleCustomFollowUp}>{tTma("saveFollowUp")}</Button>
            </div>
          </div>
        </Modal>

        {/* Email Preview Modal */}
        <Modal open={emailPreview !== null} onClose={() => setEmailPreview(null)} size="lg">
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{tEmail("preview")}</h3>
                <p className="text-sm text-gray-500">{tEmail("previewDescription")}</p>
              </div>
              {/* AI Generate Buttons - Standard & Best (with research) */}
              {emailCandidates.length > 0 && (
                <div className="flex gap-2">
                  {/* Standard Draft Button */}
                  <button
                    type="button"
                    onClick={handleGenerateStandard}
                    disabled={!!generatingAi}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      generatingAi === "standard"
                        ? "bg-gray-200 text-gray-500 cursor-wait border border-gray-300"
                        : generatingAi
                        ? "bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-100"
                        : activeDraftType === "standard"
                        ? "bg-gray-200 text-gray-800 border border-gray-300"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                    )}
                  >
                    {generatingAi === "standard" ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    )}
                    {tEmail("draftStandard")}
                  </button>
                  
                  {/* Best Draft Button (with research) */}
                  <button
                    type="button"
                    onClick={handleGenerateBest}
                    disabled={!!generatingAi}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      generatingAi === "best"
                        ? "bg-purple-200 text-purple-500 cursor-wait"
                        : generatingAi
                        ? "bg-purple-50 text-purple-200 cursor-not-allowed"
                        : activeDraftType === "best"
                        ? "bg-purple-600 text-white shadow-md"
                        : "bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 shadow-sm hover:shadow-md"
                    )}
                  >
                    {generatingAi === "best" ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                    {tEmail("draftBest")}
                  </button>
                </div>
              )}
            </div>

            {/* AI Error Message */}
            {aiError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {aiError}
              </div>
            )}

            {/* Research Confidence Indicator (for Best drafts) */}
            {activeDraftType === "best" && researchConfidence && (
              <div className={cn(
                "rounded-lg border px-3 py-2 text-sm flex items-center gap-2",
                researchConfidence === "high" 
                  ? "border-green-200 bg-green-50 text-green-700"
                  : researchConfidence === "medium"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-gray-200 bg-gray-50 text-gray-600"
              )}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {tEmail("researchConfidence")}: {tEmail(`confidence${researchConfidence.charAt(0).toUpperCase() + researchConfidence.slice(1)}`)}
              </div>
            )}
            
            {emailPreview && (
              <>
                <div className="space-y-3">
                  {/* Recipients */}
                  <div>
                    <label className="text-xs uppercase text-gray-400">{tEmail("recipients")}</label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {emailPreview.recipients.map((email, i) => (
                        <span key={i} className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                          {email}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Editable Subject */}
                  <div>
                    <label className="text-xs uppercase text-gray-400">{tEmail("subject")}</label>
                    <Input
                      className="mt-1"
                      value={editableSubject}
                      onChange={(e) => setEditableSubject(e.target.value)}
                      placeholder={tEmail("subjectPlaceholder")}
                    />
                  </div>

                  {/* Editable Body */}
                  <div>
                    <label className="text-xs uppercase text-gray-400">{tEmail("message")}</label>
                    <div className="relative mt-1">
                      <Textarea
                        className={cn(
                          "min-h-[150px] font-mono text-xs transition-opacity",
                          generatingAi && "opacity-30"
                        )}
                        value={editableBody}
                        onChange={(e) => setEditableBody(e.target.value)}
                        placeholder={tEmail("messagePlaceholder")}
                        disabled={!!generatingAi}
                      />
                      {/* Shimmer overlay while generating */}
                      {generatingAi && (
                        <div className="absolute inset-0 pointer-events-none rounded-md bg-white/80 backdrop-blur-[1px] flex items-start justify-start p-4">
                          <div>
                            <TextShimmer className="text-sm font-medium" duration={1.5}>
                              {generatingAi === "best" ? tEmail("generatingBest") : tEmail("generatingStandard")}
                            </TextShimmer>
                            <p className="mt-2 text-xs text-gray-400">
                              {generatingAi === "best" ? tEmail("generatingBestHint") : tEmail("generatingStandardHint")}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{tEmail("signatureNote")}</p>
                  </div>

                  {/* Attachments */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs uppercase text-gray-400">{tEmail("attachments")}</label>
                      <button
                        type="button"
                        onClick={() => setShowCandidatePicker(true)}
                        className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        {tEmail("addCandidate")}
                      </button>
                    </div>
                    <div className="mt-2 space-y-1">
                      {emailPreview.attachments.map((att, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-center justify-between rounded-lg border px-3 py-2",
                            att.error
                              ? "border-red-200 bg-red-50"
                              : "border-gray-200 bg-gray-50"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className={cn("h-4 w-4", att.error ? "text-red-500" : "text-red-500")}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className={cn("text-sm", att.error ? "text-red-700" : "text-gray-700")}>
                              {att.name}
                            </span>
                            {att.error && (
                              <span className="text-xs text-red-500">— {att.error}</span>
                            )}
                          </div>
                          {att.type === "candidate" && (
                            <button
                              type="button"
                              onClick={() => {
                                // Find and remove the candidate matching this attachment
                                const candidateName = att.name.replace("KP - ", "").replace(".pdf", "");
                                const candidate = emailCandidates.find(
                                  (c) => `${c.first_name} ${c.last_name}` === candidateName
                                );
                                if (candidate) {
                                  handleRemoveCandidate(candidate.id);
                                }
                              }}
                              className="ml-2 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                              title={tCommon("remove")}
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {emailPreview.attachments.length === 0 && (
                        <p className="text-sm text-gray-400 italic">{tEmail("noAttachments")}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Error/Success Messages */}
                {emailSent && (
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm",
                      emailSent.status === "success"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : emailSent.status === "warning"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-red-50 text-red-600 border border-red-200"
                    )}
                  >
                    {emailSent.message}
                  </div>
                )}

                {emailPreview.candidateErrors && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    {tEmail("missingProfilesWarning")}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEmailPreview(null)} disabled={sendingEmail}>
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    onClick={handleSendEmail}
                    disabled={sendingEmail || emailSent?.status === "success" || !emailPreview.canSend}
                  >
                    {sendingEmail ? tEmail("sending") : emailSent?.status === "success" ? tEmail("sent") : tEmail("send")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>

        {/* Candidate Picker Modal for adding to email */}
        <CandidatePickerModal
          open={showCandidatePicker}
          onClose={() => setShowCandidatePicker(false)}
          onSelect={handleAddCandidate}
        />

        {/* Candidate Match Modal for finding alternative candidates */}
        <CandidateMatchModal
          open={showCandidateMatch}
          onClose={() => setShowCandidateMatch(false)}
          contact={contact}
        />

        {/* Team Candidates Modal - shows available candidates from same team */}
        {contact && selectedCandidate && (
          <TeamCandidatesModal
            open={showTeamCandidates}
            onClose={() => setShowTeamCandidates(false)}
            contactId={contact.id}
            selectedCandidateId={selectedCandidate.id}
            contactName={contact.company_name}
          />
        )}

        {/* Vacancy Quick View Popup */}
        <VacancyQuickView
          vacancy={selectedVacancy}
          isOpen={!!selectedVacancy}
          onClose={() => setSelectedVacancy(null)}
        />
      </>
    );
  }
});

// ========== HELPER COMPONENTS ==========

function InfoChip({ 
  icon, 
  label, 
  href 
}: { 
  icon: React.ReactNode; 
  label: string; 
  href?: string;
}) {
  const baseClasses = cn(
    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
    "bg-gray-100/80 text-gray-600",
    href && "hover:bg-gray-200/80 transition-colors cursor-pointer"
  );

  if (href) {
    return (
      <a href={href} className={baseClasses}>
        {icon}
        <span className="max-w-[140px] truncate">{label}</span>
      </a>
    );
  }

  return (
    <div className={baseClasses}>
      {icon}
      <span className="max-w-[180px] truncate">{label}</span>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

// Vacancy Banner - compact header indicator
const VacancyBanner = memo(function VacancyBanner({
  vacancies,
  onViewDetails,
}: {
  vacancies: Vacancy[];
  onViewDetails: (vacancy: Vacancy) => void;
}) {
  const sortedVacancies = [...vacancies].sort((a, b) => (b.urgency || 1) - (a.urgency || 1));
  const mostUrgent = sortedVacancies[0];

  return (
    <button
      onClick={() => onViewDetails(mostUrgent)}
      className="w-full px-6 py-2 border-t border-purple-100 bg-purple-50/50 hover:bg-purple-100/50 transition-colors text-left group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-purple-600">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-sm font-medium text-purple-900">
            {vacancies.length === 1 ? "Offene Vakanz" : `${vacancies.length} Offene Vakanzen`}
          </span>
          <span className="text-xs text-purple-600">{mostUrgent.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {Array.from({ length: mostUrgent.urgency || 1 }).map((_, i) => (
              <svg key={i} className="w-3 h-3 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
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

// Follow-up chip/dropdown
function FollowUpChip({
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
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
          currentDate 
            ? "bg-amber-100 text-amber-700 hover:bg-amber-200" 
            : "bg-gray-100/80 text-gray-500 hover:bg-gray-200/80"
        )}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {currentDate ? formatFollowUpDate(currentDate) : "Follow-up"}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
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

// ========== UTILITY FUNCTIONS ==========

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
