"use client";

import { useMemo, useRef } from "react";
import { ContactList } from "./ContactList";
import { ContactDetail } from "./ContactDetail";
import type { Contact } from "@/lib/types";
import { useContacts } from "@/lib/hooks/useContacts";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { KEYBOARD_SHORTCUTS } from "@/lib/utils/constants";

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

  const notesRef = useRef<HTMLTextAreaElement>(null);

  const actionMessage = useMemo(() => {
    if (actionState.type && actionState.message) {
      return actionState.message;
    }
    if (error) return error;
    return null;
  }, [actionState, error]);

  const handleCall = () => {
    if (!activeContact?.phone) return;
    const tel = activeContact.phone.replace(/\s+/g, "");
    window.location.href = `tel:${tel}`;
  };

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
      key: KEYBOARD_SHORTCUTS.FOCUS_NOTES,
      handler: (event) => {
        event.preventDefault();
        notesRef.current?.focus();
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
      />
      <ContactDetail
        key={activeContact?.id ?? "empty"}
        contact={activeContact}
        onCall={handleCall}
        onOutcome={handleOutcome}
        onNext={goToNextContact}
        onSaveNotes={updateNotes}
        notesRef={notesRef}
        actionMessage={actionMessage}
        actionType={actionState.type}
        onUpdateStatus={updateStatus}
        onScheduleFollowUp={scheduleFollowUp}
        onClearFollowUp={clearFollowUp}
        onClearStatus={clearStatus}
      />
    </div>
  );
}

