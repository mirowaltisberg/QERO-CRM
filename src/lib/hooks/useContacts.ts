"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contact } from '@/lib/types';
import type { CallOutcome } from '@/lib/utils/constants';

interface UseContactsOptions {
  initialContacts?: Contact[];
}

interface ActionState {
  type: 'logging' | 'saving' | null;
  message?: string;
}

export function useContacts({ initialContacts = [] }: UseContactsOptions) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [activeId, setActiveId] = useState<string | null>(
    initialContacts[0]?.id ?? null
  );
  const [loading, setLoading] = useState(false);
  const [actionState, setActionState] = useState<ActionState>({ type: null });
  const [error, setError] = useState<string | null>(null);
  const [cantonFilter, setCantonFilter] = useState<string | null>(null);

  const uniqueCantons = useMemo(
    () =>
      Array.from(
        new Set(
          contacts
            .map((c) => c.canton)
            .filter((canton): canton is string => Boolean(canton))
        )
      ).sort(),
    [contacts]
  );

  const visibleContacts = useMemo(() => {
    if (!cantonFilter) return contacts;
    return contacts.filter((c) => c.canton === cantonFilter);
  }, [contacts, cantonFilter]);

  const activeContact = useMemo(() => {
    if (!activeId) return visibleContacts[0] ?? null;
    return visibleContacts.find((c) => c.id === activeId) ?? visibleContacts[0] ?? null;
  }, [activeId, visibleContacts]);

  useEffect(() => {
    if (visibleContacts.length === 0) {
      setActiveId(null);
      return;
    }
    if (activeContact == null) {
      setActiveId(visibleContacts[0].id);
    }
  }, [visibleContacts, activeContact]);

  const refreshContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/contacts');
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to load contacts');
      }
      setContacts(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateContactLocally = useCallback((updated: Contact) => {
    setContacts((prev) =>
      prev.map((contact) => (contact.id === updated.id ? updated : contact))
    );
  }, []);

  const fetchContact = useCallback(async (id: string) => {
    const response = await fetch(`/api/contacts/${id}`);
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || 'Failed to fetch contact');
    }
    return json.data as Contact;
  }, []);

  const selectContactByIndex = useCallback(
    (indexDelta: number) => {
      if (visibleContacts.length === 0) return;
      const currentIndex = visibleContacts.findIndex((c) => c.id === activeContact?.id);
      const nextIndex =
        (currentIndex + indexDelta + visibleContacts.length) % visibleContacts.length;
      setActiveId(visibleContacts[nextIndex].id);
    },
    [visibleContacts, activeContact?.id]
  );

  const selectContact = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const logCallOutcome = useCallback(
    async (outcome: CallOutcome, notes?: string) => {
      if (!activeContact) return false;
      setActionState({ type: "logging", message: "Logging call..." });
      setError(null);
      try {
        const response = await fetch("/api/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_id: activeContact.id,
            outcome,
            notes,
          }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to log call");
        }

        const updatedContact = await fetchContact(activeContact.id);
        updateContactLocally(updatedContact);

        selectContactByIndex(1); // auto-advance
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to log call");
        return false;
      } finally {
        setActionState({ type: null });
      }
    },
    [activeContact, fetchContact, selectContactByIndex, updateContactLocally]
  );

  const updateNotes = useCallback(
    async (notes: string | null) => {
      if (!activeContact) return;
      setActionState({ type: "saving", message: "Saving notes..." });
      setError(null);
      try {
        const response = await fetch(`/api/contacts/${activeContact.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to save notes");
        }
        updateContactLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save notes");
        throw err;
      } finally {
        setActionState({ type: null });
      }
    },
    [activeContact, updateContactLocally]
  );

  const goToNextContact = useCallback(() => {
    selectContactByIndex(1);
  }, [selectContactByIndex]);

  const goToPreviousContact = useCallback(() => {
    selectContactByIndex(-1);
  }, [selectContactByIndex]);

  return {
    contacts: visibleContacts,
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
    setCantonFilter,
    clearCantonFilter: () => setCantonFilter(null),
  };
}

