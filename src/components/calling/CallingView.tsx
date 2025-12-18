"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ContactList } from "./ContactList";
import { ContactDetail } from "./ContactDetail";
import { CandidatePickerModal } from "./CandidatePickerModal";
import { CandidateModeBanner } from "./CandidateModeBanner";
import { SelectCandidateButton } from "./SelectCandidateButton";
import { TeamFilter } from "@/components/contacts/TeamFilter";
import type { Contact, ContactCallLog, Vacancy, TmaCandidate } from "@/lib/types";
import { useContacts } from "@/lib/hooks/useContacts";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { KEYBOARD_SHORTCUTS } from "@/lib/utils/constants";
import { createClient } from "@/lib/supabase/client";
import { chunkUnique } from "@/lib/utils/chunk";
import { fixContactDisplay } from "@/lib/utils/client-encoding-fix";

interface CallingViewProps {
  initialContacts: Contact[];
  currentUserTeamId: string | null;
  initialTeamFilter: string | "all";
}

export function CallingView({ initialContacts, currentUserTeamId, initialTeamFilter }: CallingViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectFromUrl = searchParams.get("select");
  
  // Fix encoding issues on initial contacts
  const fixedInitialContacts = useMemo(
    () => initialContacts.map(fixContactDisplay),
    [initialContacts]
  );
  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  // Candidate mode state
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<TmaCandidate | null>(null);
  const [sortedContacts, setSortedContacts] = useState<Contact[] | null>(null);
  const [sortingLoading, setSortingLoading] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null); // null = all, or 10, 25, 50 km
  const [restoringSession, setRestoringSession] = useState(true);

  // LocalStorage key for persisting candidate selection
  const CANDIDATE_STORAGE_KEY = "qero_calling_candidate";

  const {
    contacts: originalContacts,
    activeContact,
    loading,
    error,
    actionState,
    cantonFilter,
    uniqueCantons,
    searchQuery,
    selectContact,
    goToNextContact,
    goToPreviousContact,
    refreshContacts,
    logCallOutcome,
    updateNotes,
    updateStatus,
    scheduleFollowUp,
    clearFollowUp,
    clearStatus,
    setCantonFilter,
    clearCantonFilter,
    setSearchQuery,
  } = useContacts({ initialContacts: fixedInitialContacts });

  // Use sorted contacts when in candidate mode, otherwise original contacts
  // Apply distance filter AND search query when in candidate mode
  const contacts = useMemo(() => {
    if (!sortedContacts) return originalContacts;
    
    let filtered = sortedContacts;
    
    // Apply distance filter
    if (distanceFilter !== null) {
      filtered = filtered.filter((c) => {
        if (c.distance_km === null || c.distance_km === undefined) return false;
        return c.distance_km <= distanceFilter;
      });
    }
    
    // Apply search query filter (same logic as useContacts)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => {
        const searchableFields = [
          c.company_name,
          c.contact_name,
          c.email,
          c.phone,
          c.canton,
          c.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        return searchableFields.includes(query);
      });
    }
    
    return filtered;
  }, [sortedContacts, originalContacts, distanceFilter, searchQuery]);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Restore candidate from localStorage on mount - fetch fresh data from API
  useEffect(() => {
    const stored = localStorage.getItem(CANDIDATE_STORAGE_KEY);
    if (stored) {
      try {
        const storedCandidate = JSON.parse(stored) as TmaCandidate;
        const candidateId = storedCandidate.id;
        
        // Fetch fresh candidate data from API to ensure we have latest info (e.g., short_profile_url)
        fetch(`/api/tma/${candidateId}`)
          .then((res) => res.json())
          .then((json) => {
            if (json.data) {
              const freshCandidate = json.data as TmaCandidate;
              setSelectedCandidate(freshCandidate);
              // Update localStorage with fresh data
              localStorage.setItem(CANDIDATE_STORAGE_KEY, JSON.stringify(freshCandidate));
              
              if (freshCandidate.latitude && freshCandidate.longitude) {
                setSortingLoading(true);
                return fetch(`/api/contacts/sorted-by-candidate?candidateId=${candidateId}`)
                  .then((res) => res.json())
                  .then((json) => {
                    setSortedContacts(json.data || []);
                  })
                  .finally(() => {
                    setSortingLoading(false);
                  });
              }
            } else {
              // Candidate not found - clear from storage
              localStorage.removeItem(CANDIDATE_STORAGE_KEY);
            }
          })
          .catch((err) => {
            console.error("Error fetching candidate:", err);
            // Fall back to stored data if fetch fails
            setSelectedCandidate(storedCandidate);
          })
          .finally(() => {
            setRestoringSession(false);
          });
      } catch (err) {
        console.error("Error parsing stored candidate:", err);
        localStorage.removeItem(CANDIDATE_STORAGE_KEY);
        setRestoringSession(false);
      }
    } else {
      setRestoringSession(false);
    }
  }, [CANDIDATE_STORAGE_KEY]);

  // Candidate mode handlers
  const handleOpenCandidatePicker = useCallback(() => {
    setShowPickerModal(true);
  }, []);

  const handleCandidateSelected = useCallback(async (candidate: TmaCandidate) => {
    setSelectedCandidate(candidate);
    setShowPickerModal(false);

    // Save to localStorage for session persistence
    localStorage.setItem(CANDIDATE_STORAGE_KEY, JSON.stringify(candidate));

    // Open short profile in new tab if available
    if (candidate.short_profile_url) {
      window.open(candidate.short_profile_url, "_blank");
    }

    // Check if candidate has coordinates
    if (!candidate.latitude || !candidate.longitude) {
      console.warn("Candidate has no location data, cannot sort contacts by distance");
      return;
    }

    // Fetch sorted contacts
    setSortingLoading(true);
    try {
      const res = await fetch(`/api/contacts/sorted-by-candidate?candidateId=${candidate.id}`);
      if (res.ok) {
        const json = await res.json();
        setSortedContacts(json.data || []);
      } else {
        console.error("Failed to fetch sorted contacts");
      }
    } catch (err) {
      console.error("Error fetching sorted contacts:", err);
    } finally {
      setSortingLoading(false);
    }
  }, [CANDIDATE_STORAGE_KEY]);

  const handleChangeCandidate = useCallback(() => {
    setShowPickerModal(true);
  }, []);

  const handleExitCandidateMode = useCallback(() => {
    setSelectedCandidate(null);
    setSortedContacts(null);
    setDistanceFilter(null);
    localStorage.removeItem(CANDIDATE_STORAGE_KEY);
  }, [CANDIDATE_STORAGE_KEY]);

  // Reset to list view if active contact is cleared on mobile
  useEffect(() => {
    if (isMobile && !activeContact && mobileView === "detail") {
      setMobileView("list");
    }
  }, [isMobile, activeContact, mobileView]);

  // Mobile contact selection handler
  const handleMobileSelectContact = useCallback((id: string) => {
    selectContact(id);
    if (isMobile) {
      setMobileView("detail");
    }
  }, [selectContact, isMobile]);

  // Mobile back handler
  const handleMobileBack = useCallback(() => {
    setMobileView("list");
  }, []);

  // Handle URL-based selection (from command palette)
  useEffect(() => {
    if (selectFromUrl && contacts.length > 0) {
      const contactExists = contacts.find((c) => c.id === selectFromUrl);
      if (contactExists) {
        selectContact(selectFromUrl);
        // Clear the URL param without navigation
        window.history.replaceState({}, "", "/calling");
      }
    }
  }, [selectFromUrl, contacts, selectContact]);

  const supabase = useMemo(() => createClient(), []);

  // Track call logs for contacts (contactId -> latest call log)
  const [callLogs, setCallLogs] = useState<Record<string, ContactCallLog>>({});
  
  // Track if a call was initiated for the current contact (waiting for note)
  const [callInitiatedForContact, setCallInitiatedForContact] = useState<string | null>(null);

  // Track vacancies by contact ID
  const [contactVacancies, setContactVacancies] = useState<Record<string, Vacancy[]>>({});

  // Fetch call logs for all contacts in a SINGLE batched request
  useEffect(() => {
    if (!contacts.length) return;

    async function fetchCallLogs() {
      try {
        const batches = chunkUnique(
          contacts.map((c) => c.id),
          200 // stay well below server limit of 500
        );

        const batchResults = await Promise.all(
          batches.map(async (batch) => {
            const res = await fetch("/api/contacts/call-logs", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ contact_ids: batch }),
              credentials: "include",
              cache: "no-store",
            });

            const json = await res.json().catch(() => null);
            if (!res.ok) {
              console.error("Error fetching call logs batch:", json?.error ?? res.statusText);
              return {};
            }
            return (json?.data as Record<string, ContactCallLog>) ?? {};
          })
        );

        const merged = batchResults.reduce<Record<string, ContactCallLog>>(
          (acc, curr) => Object.assign(acc, curr),
          {}
        );

        setCallLogs(merged);
      } catch (err) {
        console.error("Error fetching call logs:", err);
      }
    }

    fetchCallLogs();
  }, [contacts]);

  // Fetch vacancies and group by contact_id
  useEffect(() => {
    async function fetchVacancies() {
      try {
        const res = await fetch("/api/vacancies?status=open");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const grouped: Record<string, Vacancy[]> = {};
            data.forEach((v: Vacancy) => {
              if (!grouped[v.contact_id]) grouped[v.contact_id] = [];
              grouped[v.contact_id].push(v);
            });
            setContactVacancies(grouped);
          }
        }
      } catch (err) {
        console.error("Error fetching vacancies:", err);
      }
    }
    fetchVacancies();
  }, []);

  // Real-time subscription for call logs
  useEffect(() => {
    // Subscribe to INSERT events on contact_call_logs
    const channel = supabase
      .channel("call-logs-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "contact_call_logs",
        },
        async (payload) => {
          // When a new call log is inserted, fetch just that one contact's log
          const newLog = payload.new as { id: string; contact_id: string; user_id: string; called_at: string };
          
          try {
            const res = await fetch("/api/contacts/call-logs", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ contact_ids: [newLog.contact_id] }),
              credentials: "include",
              cache: "no-store",
            });
            
            if (res.ok) {
              const json = await res.json();
              if (json.data?.[newLog.contact_id]) {
                setCallLogs((prev) => ({
                  ...prev,
                  [newLog.contact_id]: json.data[newLog.contact_id],
                }));
              }
            }
          } catch (err) {
            console.error("Error fetching updated call log:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Reset call initiated state when switching contacts
  useEffect(() => {
    if (activeContact?.id !== callInitiatedForContact) {
      setCallInitiatedForContact(null);
    }
  }, [activeContact?.id, callInitiatedForContact]);

  // Log a call to the API (still uses individual endpoint for POST)
  const logCallToApi = useCallback(async (contactId: string) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/call-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          for_candidate_id: selectedCandidate?.id ?? null,
        }),
        credentials: "include",
        cache: "no-store",
      });
      
      if (res.ok) {
        const json = await res.json();
        if (json.data && !json.data.duplicate) {
          setCallLogs((prev) => ({
            ...prev,
            [contactId]: json.data,
          }));
        }
      }
    } catch (err) {
      console.error("Error logging call:", err);
    }
  }, [selectedCandidate?.id]);

  const actionMessage = useMemo(() => {
    if (actionState.type && actionState.message) {
      return actionState.message;
    }
    if (error) return error;
    return null;
  }, [actionState, error]);

  const handleCall = useCallback(() => {
    if (!activeContact?.phone) return;
    
    // Mark that a call was initiated for this contact
    setCallInitiatedForContact(activeContact.id);
    
    // Open phone dialer
    const tel = activeContact.phone.replace(/\s+/g, "");
    window.location.href = `tel:${tel}`;
  }, [activeContact]);

  // When a new note is added, log the call if one was initiated
  const handleNoteAdded = useCallback(async () => {
    if (!activeContact || !callInitiatedForContact) return;
    
    if (callInitiatedForContact === activeContact.id) {
      await logCallToApi(activeContact.id);
      setCallInitiatedForContact(null);
    }
  }, [activeContact, callInitiatedForContact, logCallToApi]);

  const handleOutcome = async (outcome: Parameters<typeof logCallOutcome>[0]) => {
    await logCallOutcome(outcome);
  };

  // Handle team filter change
  const handleTeamFilterChange = useCallback((teamId: string | "all") => {
    // Update URL to trigger page re-render with new team filter
    const params = new URLSearchParams(searchParams.toString());
    if (teamId === currentUserTeamId) {
      // Remove param if switching back to user's team (default)
      params.delete("team");
    } else {
      params.set("team", teamId);
    }
    router.push(`/calling?${params.toString()}`);
  }, [router, searchParams, currentUserTeamId]);

  useKeyboardShortcuts([
    {
      key: KEYBOARD_SHORTCUTS.NAVIGATE_DOWN,
      handler: (event) => {
        event.preventDefault();
        goToNextContact();
      },
    },
    {
      key: KEYBOARD_SHORTCUTS.NAVIGATE_UP,
      handler: (event) => {
        event.preventDefault();
        goToPreviousContact();
      },
    },
    {
      key: KEYBOARD_SHORTCUTS.CALL,
      handler: (event) => {
        event.preventDefault();
        handleCall();
      },
    },
    {
      key: KEYBOARD_SHORTCUTS.OUTCOME_1,
      handler: (event) => {
        event.preventDefault();
        handleOutcome("no_answer");
      },
    },
    {
      key: KEYBOARD_SHORTCUTS.OUTCOME_2,
      handler: (event) => {
        event.preventDefault();
        handleOutcome("not_interested");
      },
    },
    {
      key: KEYBOARD_SHORTCUTS.OUTCOME_3,
      handler: (event) => {
        event.preventDefault();
        handleOutcome("interested");
      },
    },
    {
      key: KEYBOARD_SHORTCUTS.OUTCOME_4,
      handler: (event) => {
        event.preventDefault();
        handleOutcome("follow_up");
      },
    },
    {
      key: KEYBOARD_SHORTCUTS.OUTCOME_5,
      handler: (event) => {
        event.preventDefault();
        handleOutcome("meeting_set");
      },
    },
    {
      key: KEYBOARD_SHORTCUTS.CONFIRM,
      handler: (event) => {
        event.preventDefault();
        goToNextContact();
      },
    },
  ]);

  // ==================== MOBILE ====================
  if (isMobile) {
    return (
      <div className="relative h-full overflow-hidden bg-gray-50">
        {/* Candidate Picker Modal */}
        <CandidatePickerModal
          open={showPickerModal}
          onClose={() => setShowPickerModal(false)}
          onSelect={handleCandidateSelected}
        />

        {/* Contact List */}
        <div
          className={`absolute inset-0 bg-gray-50 transition-transform duration-300 ease-out ${
            mobileView === "detail" ? "-translate-x-full" : "translate-x-0"
          }`}
        >
          {/* Candidate Mode Banner or Select Button */}
          {selectedCandidate ? (
            <CandidateModeBanner
              candidate={selectedCandidate}
              onChangeCandidate={handleChangeCandidate}
              onExitMode={handleExitCandidateMode}
              distanceFilter={distanceFilter}
              onDistanceFilterChange={setDistanceFilter}
              filteredCount={contacts.length}
              totalCount={sortedContacts?.length ?? 0}
            />
          ) : (
            <SelectCandidateButton onClick={handleOpenCandidatePicker} />
          )}
          <ContactList
            contacts={contacts}
            activeContactId={activeContact?.id ?? null}
            onSelect={handleMobileSelectContact}
            loading={loading || sortingLoading}
            onRefresh={refreshContacts}
            onFilterByCanton={setCantonFilter}
            onClearCantonFilter={clearCantonFilter}
            activeCantonFilter={cantonFilter}
            availableCantons={uniqueCantons}
            callLogs={callLogs}
            contactVacancies={contactVacancies}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isMobile={true}
          />
        </div>

        {/* Contact Detail */}
        <div
          className={`absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-out ${
            mobileView === "detail" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Mobile Header */}
          <header 
            className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
          >
            <button 
              onClick={handleMobileBack}
              className="flex items-center justify-center w-8 h-8 -ml-2 rounded-lg text-gray-600 active:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold text-gray-900 truncate">
                {activeContact?.company_name || "Firma auswählen"}
              </h1>
              {activeContact?.canton && (
                <p className="text-xs text-gray-500">{activeContact.canton}</p>
              )}
            </div>

            {/* Call button in header */}
            {activeContact?.phone && (
              <button
                onClick={handleCall}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500 text-white active:bg-green-600"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 01.85-.25 11.36 11.36 0 003.55.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.55 1 1 0 01-.25.85l-2.2 2.2z" />
                </svg>
              </button>
            )}
          </header>

          {/* Detail Content */}
          <div className="flex-1 overflow-y-auto">
            <ContactDetail
              key={activeContact?.id ?? "empty"}
              contact={activeContact}
              onCall={handleCall}
              onNext={goToNextContact}
              onSaveNotes={updateNotes}
              actionMessage={actionMessage}
              onUpdateStatus={updateStatus}
              onScheduleFollowUp={scheduleFollowUp}
              onClearFollowUp={clearFollowUp}
              onClearStatus={clearStatus}
              onNoteAdded={handleNoteAdded}
              vacancies={activeContact ? contactVacancies[activeContact.id] : undefined}
              isMobile={true}
              selectedCandidate={selectedCandidate}
            />
          </div>
        </div>
      </div>
    );
  }

  // ==================== DESKTOP ====================
  return (
    <div className="flex h-full flex-col">
      {/* Candidate Picker Modal */}
      <CandidatePickerModal
        open={showPickerModal}
        onClose={() => setShowPickerModal(false)}
        onSelect={handleCandidateSelected}
      />

      {/* Candidate Mode Banner or Select Button */}
      {selectedCandidate ? (
        <CandidateModeBanner
          candidate={selectedCandidate}
          onChangeCandidate={handleChangeCandidate}
          onExitMode={handleExitCandidateMode}
          distanceFilter={distanceFilter}
          onDistanceFilterChange={setDistanceFilter}
          filteredCount={contacts.length}
          totalCount={sortedContacts?.length ?? 0}
        />
      ) : (
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-3">
          <SelectCandidateButton onClick={handleOpenCandidatePicker} />
          <TeamFilter
            value={initialTeamFilter}
            onChange={handleTeamFilterChange}
            currentUserTeamId={currentUserTeamId}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <ContactList
          contacts={contacts}
          activeContactId={activeContact?.id ?? null}
          onSelect={selectContact}
          loading={loading || sortingLoading}
          onRefresh={refreshContacts}
          onFilterByCanton={setCantonFilter}
          onClearCantonFilter={clearCantonFilter}
          activeCantonFilter={cantonFilter}
          availableCantons={uniqueCantons}
          callLogs={callLogs}
          contactVacancies={contactVacancies}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <ContactDetail
          key={activeContact?.id ?? "empty"}
          contact={activeContact}
          onCall={handleCall}
          onNext={goToNextContact}
          onSaveNotes={updateNotes}
          actionMessage={actionMessage}
          onUpdateStatus={updateStatus}
          onScheduleFollowUp={scheduleFollowUp}
          onClearFollowUp={clearFollowUp}
          onClearStatus={clearStatus}
          onNoteAdded={handleNoteAdded}
          vacancies={activeContact ? contactVacancies[activeContact.id] : undefined}
          selectedCandidate={selectedCandidate}
        />
      </div>
    </div>
  );
}
