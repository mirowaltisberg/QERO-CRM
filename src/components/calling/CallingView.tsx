"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { ContactList } from "./ContactList";
import { ContactDetail } from "./ContactDetail";
import type { Contact, ContactCallLog } from "@/lib/types";
import { useContacts } from "@/lib/hooks/useContacts";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { KEYBOARD_SHORTCUTS } from "@/lib/utils/constants";
import { createClient } from "@/lib/supabase/client";

interface CallingViewProps {
  initialContacts: Contact[];
}

export function CallingView({ initialContacts }: CallingViewProps) {
  const {
    contacts,
    activeContact,
    loading,
    error,
    actionState,
    cantonFilter,
    uniqueCantons,
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
  } = useContacts({ initialContacts });

  // Track call logs for contacts (contactId -> latest call log)
  const [callLogs, setCallLogs] = useState<Record<string, ContactCallLog>>({});
  
  // Track if a call was initiated for the current contact (waiting for note)
  const [callInitiatedForContact, setCallInitiatedForContact] = useState<string | null>(null);

  // Fetch call logs for all contacts on mount and when contacts change
  useEffect(() => {
    async function fetchCallLogs() {
      if (contacts.length === 0) return;
      
      try {
        // Fetch latest call log for each contact in parallel (batch of 10)
        const batchSize = 10;
        const logs: Record<string, ContactCallLog> = {};
        
        for (let i = 0; i < contacts.length; i += batchSize) {
          const batch = contacts.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map(async (contact) => {
              try {
                const res = await fetch(`/api/contacts/${contact.id}/call-logs`);
                if (res.ok) {
                  const json = await res.json();
                  return { contactId: contact.id, log: json.data };
                }
              } catch {
                // Ignore errors for individual contacts
              }
              return { contactId: contact.id, log: null };
            })
          );
          
          results.forEach(({ contactId, log }) => {
            if (log) {
              logs[contactId] = log;
            }
          });
        }
        
        setCallLogs(logs);
      } catch (err) {
        console.error("Error fetching call logs:", err);
      }
    }
    
    fetchCallLogs();
  }, [contacts]);

  // Real-time subscription for call logs
  useEffect(() => {
    const supabase = createClient();
    
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
          // When a new call log is inserted, fetch the full data with caller info
          const newLog = payload.new as { id: string; contact_id: string; user_id: string; called_at: string };
          
          try {
            const res = await fetch(`/api/contacts/${newLog.contact_id}/call-logs`);
            if (res.ok) {
              const json = await res.json();
              if (json.data) {
                setCallLogs((prev) => ({
                  ...prev,
                  [newLog.contact_id]: json.data,
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
  }, []);

  // Reset call initiated state when switching contacts
  useEffect(() => {
    // Don't reset if we're switching to the same contact or no contact
    if (activeContact?.id !== callInitiatedForContact) {
      setCallInitiatedForContact(null);
    }
  }, [activeContact?.id]);

  // Log a call to the API
  const logCallToApi = useCallback(async (contactId: string) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/call-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (res.ok) {
        const json = await res.json();
        if (json.data && !json.data.duplicate) {
          // Update local state with new call log
          setCallLogs((prev) => ({
            ...prev,
            [contactId]: json.data,
          }));
        }
      }
    } catch (err) {
      console.error("Error logging call:", err);
    }
  }, []);

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

  // Wrapper for saving notes - logs call if one was initiated
  const handleSaveNotes = useCallback(async (notes: string) => {
    if (!activeContact) return;
    
    // Save the notes first
    await updateNotes(notes);
    
    // If a call was initiated for this contact, log it now
    if (callInitiatedForContact === activeContact.id) {
      await logCallToApi(activeContact.id);
      setCallInitiatedForContact(null); // Reset after logging
    }
  }, [activeContact, callInitiatedForContact, updateNotes, logCallToApi]);

  const handleOutcome = async (outcome: Parameters<typeof logCallOutcome>[0]) => {
    await logCallOutcome(outcome);
  };

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

  return (
    <div className="flex h-full">
      <ContactList
        contacts={contacts}
        activeContactId={activeContact?.id ?? null}
        onSelect={selectContact}
        loading={loading}
        onRefresh={refreshContacts}
        onFilterByCanton={setCantonFilter}
        onClearCantonFilter={clearCantonFilter}
        activeCantonFilter={cantonFilter}
        availableCantons={uniqueCantons}
        callLogs={callLogs}
      />
      <ContactDetail
        key={activeContact?.id ?? "empty"}
        contact={activeContact}
        onCall={handleCall}
        onNext={goToNextContact}
        onSaveNotes={handleSaveNotes}
        actionMessage={actionMessage}
        onUpdateStatus={updateStatus}
        onScheduleFollowUp={scheduleFollowUp}
        onClearFollowUp={clearFollowUp}
        onClearStatus={clearStatus}
        callInitiated={callInitiatedForContact === activeContact?.id}
      />
    </div>
  );
}
