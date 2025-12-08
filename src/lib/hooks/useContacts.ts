"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contact } from '@/lib/types';
import type { CallOutcome, ContactStatus } from '@/lib/utils/constants';
import { createClient } from "@/lib/supabase/client";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [personalSettingsLoaded, setPersonalSettingsLoaded] = useState(false);
  
  // Fetch and merge personal settings on client side
  useEffect(() => {
    if (personalSettingsLoaded || initialContacts.length === 0) return;
    
    async function loadPersonalSettings() {
      try {
        const contactIds = initialContacts.map(c => c.id);
        const response = await fetch("/api/contacts/personal-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact_ids: contactIds }),
        });
        
        if (response.ok) {
          const { data } = await response.json();
          const settingsMap = data || {};
          
          // Merge personal settings with contacts
          setContacts(prev => prev.map(contact => ({
            ...contact,
            status: settingsMap[contact.id]?.status ?? contact.status,
            follow_up_at: settingsMap[contact.id]?.follow_up_at ?? contact.follow_up_at,
            follow_up_note: settingsMap[contact.id]?.follow_up_note ?? contact.follow_up_note,
          })));
        }
      } catch (err) {
        console.error("[Personal Settings] Failed to load:", err);
      } finally {
        setPersonalSettingsLoaded(true);
      }
    }
    
    loadPersonalSettings();
  }, [initialContacts, personalSettingsLoaded]);

  // Real-time subscription for contacts
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("contacts-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
        },
        async (payload) => {
          console.log("[Contacts Realtime] Change:", payload.eventType);

          if (payload.eventType === "INSERT") {
            // Fetch full contact data
            try {
              const res = await fetch(`/api/contacts/${payload.new.id}`);
              if (res.ok) {
                const json = await res.json();
                if (json.data) {
                  setContacts((prev) => [json.data, ...prev]);
                }
              }
            } catch {
              setContacts((prev) => [payload.new as Contact, ...prev]);
            }
          } else if (payload.eventType === "UPDATE") {
            // Fetch updated contact
            try {
              const res = await fetch(`/api/contacts/${payload.new.id}`);
              if (res.ok) {
                const json = await res.json();
                if (json.data) {
                  setContacts((prev) =>
                    prev.map((c) => (c.id === json.data.id ? json.data : c))
                  );
                }
              }
            } catch {
              setContacts((prev) =>
                prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } as Contact : c))
              );
            }
          } else if (payload.eventType === "DELETE") {
            setContacts((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe((status) => {
        console.log("[Contacts Realtime] Subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    let filtered = contacts;
    
    // Filter by canton
    if (cantonFilter) {
      filtered = filtered.filter((c) => c.canton === cantonFilter);
    }
    
    // Filter by search query
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
  }, [contacts, cantonFilter, searchQuery]);

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

  const updateStatus = useCallback(
    async (status: ContactStatus) => {
      if (!activeContact || activeContact.status === status) return;
      setActionState({ type: "saving", message: "Updating status..." });
      setError(null);
      try {
        const response = await fetch(`/api/contacts/${activeContact.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to update status");
        }
        updateContactLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update status");
      } finally {
        setActionState({ type: null });
      }
    },
    [activeContact, updateContactLocally]
  );

  const scheduleFollowUp = useCallback(
    async ({ date, note }: { date: Date; note?: string }) => {
      if (!activeContact) return;
      setActionState({ type: "saving", message: "Scheduling follow-up..." });
      setError(null);
      try {
        const response = await fetch(`/api/contacts/${activeContact.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "follow_up",
            follow_up_at: date.toISOString(),
            follow_up_note: note ?? null,
          }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Failed to schedule follow-up");
        }
        updateContactLocally(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to schedule follow-up");
      } finally {
        setActionState({ type: null });
      }
    },
    [activeContact, updateContactLocally]
  );

  const clearFollowUp = useCallback(async () => {
    if (!activeContact) return;
    setActionState({ type: "saving", message: "Clearing follow-up..." });
    setError(null);
    try {
      const response = await fetch(`/api/contacts/${activeContact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: null,
          follow_up_at: null,
          follow_up_note: null,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to clear follow-up");
      }
      updateContactLocally(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear follow-up");
    } finally {
      setActionState({ type: null });
    }
  }, [activeContact, updateContactLocally]);

  const clearStatus = useCallback(async () => {
    if (!activeContact || activeContact.status === null) return;
    setActionState({ type: "saving", message: "Clearing status..." });
    setError(null);
    try {
      const response = await fetch(`/api/contacts/${activeContact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: null }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to clear status");
      }
      updateContactLocally(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear status");
    } finally {
      setActionState({ type: null });
    }
  }, [activeContact, updateContactLocally]);

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
    clearCantonFilter: () => setCantonFilter(null),
    setSearchQuery,
  };
}
