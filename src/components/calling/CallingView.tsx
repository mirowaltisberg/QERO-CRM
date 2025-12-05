"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
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

  const supabase = useMemo(() => createClient(), []);

  // Track call logs for contacts (contactId -> latest call log)
  const [callLogs, setCallLogs] = useState<Record<string, ContactCallLog>>({});
  const [authToken, setAuthToken] = useState<string | null>(null);
  
  // Track if a call was initiated for the current contact (waiting for note)
  const [callInitiatedForContact, setCallInitiatedForContact] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setAuthToken(session?.access_token ?? null);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setAuthToken(session?.access_token ?? null);
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, [supabase]);

  // Fetch call logs for all contacts on mount and when contacts change
  useEffect(() => {
    if (!contacts.length || !authToken) return;

    async function fetchCallLogs() {
      try {
        // Fetch latest call log for each contact in parallel (batch of 10)
        const batchSize = 10;
        const logs: Record<string, ContactCallLog> = {};
        
        for (let i = 0; i < contacts.length; i += batchSize) {
          const batch = contacts.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map(async (contact) => {
              try {
                const res = await fetch(`/api/contacts/${contact.id}/call-logs`, {
                  headers: {
                    Authorization: `Bearer ${authToken}`,
                  },
                  credentials: "include",
                  cache: "no-store",
                });
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
  }, [contacts, authToken]);

  // Real-time subscription for call logs
  useEffect(() => {
    if (!authToken) return;

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
            const res = await fetch(`/api/contacts/${newLog.contact_id}/call-logs`, {
              headers: {
                Authorization: `Bearer ${authToken}`,
              },
              credentials: "include",
              cache: "no-store",
            });
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
  }, [supabase, authToken]);

  // Reset call initiated state when switching contacts
  useEffect(() => {
    if (activeContact?.id !== callInitiatedForContact) {
      setCallInitiatedForContact(null);
    }
  }, [activeContact?.id]);

  // Log a call to the API
  const logCallToApi = useCallback(async (contactId: string) => {
    if (!authToken) return;

    try {
      const res = await fetch(`/api/contacts/${contactId}/call-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
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
  }, [authToken]);

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
        onSaveNotes={updateNotes}
        actionMessage={actionMessage}
        onUpdateStatus={updateStatus}
        onScheduleFollowUp={scheduleFollowUp}
        onClearFollowUp={clearFollowUp}
        onClearStatus={clearStatus}
        onNoteAdded={handleNoteAdded}
      />
    </div>
  );
}
