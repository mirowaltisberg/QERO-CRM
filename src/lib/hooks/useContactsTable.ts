'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Contact, List } from '@/lib/types';
import type { ContactStatus } from '@/lib/utils/constants';

export interface ContactsTableFilters {
  status?: ContactStatus | 'all';
  canton?: string | 'all';
  search?: string;
}

interface UseContactsTableOptions {
  contacts: Contact[];
  lists: List[];
}

interface BulkAction {
  type: 'status' | 'assign-list' | 'delete';
  payload?: unknown;
}

export function useContactsTable({ contacts, lists }: UseContactsTableOptions) {
  const [filters, setFilters] = useState<ContactsTableFilters>({
    status: 'all',
    canton: 'all',
    search: '',
  });
  const [sortBy, setSortBy] = useState<keyof Contact>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupByCanton, setGroupByCanton] = useState(false);

  const filteredContacts = useMemo(() => {
    return contacts
      .filter((contact) => {
        if (filters.status && filters.status !== 'all') {
          if (contact.status !== filters.status) return false;
        }
        if (filters.canton && filters.canton !== 'all') {
          if (contact.canton !== filters.canton) return false;
        }
        if (filters.search) {
          const query = filters.search.toLowerCase();
          const combined = `${contact.company_name} ${contact.contact_name} ${contact.email ?? ''}`;
          if (!combined.toLowerCase().includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (groupByCanton) {
          const cantonA = a.canton ?? '';
          const cantonB = b.canton ?? '';
          if (cantonA !== cantonB) {
            return cantonA.localeCompare(cantonB);
          }
        }
        const valueA = a[sortBy];
        const valueB = b[sortBy];
        if (valueA === valueB) return 0;
        if (valueA == null) return 1;
        if (valueB == null) return -1;
        const result = valueA > valueB ? 1 : -1;
        return sortDirection === 'asc' ? result : -result;
      });
  }, [contacts, filters, sortBy, sortDirection, groupByCanton]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selected) => selected !== id) : [...prev, id]
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    const filteredIds = filteredContacts.map((contact) => contact.id);
    const allSelected = filteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  }, [filteredContacts, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const applyFilters = useCallback((updates: Partial<ContactsTableFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const applySort = useCallback((column: keyof Contact) => {
    setSortBy((prevColumn) => {
      if (prevColumn === column) {
        setSortDirection((prevDirection) => (prevDirection === 'asc' ? 'desc' : 'asc'));
        return prevColumn;
      }
      setSortDirection('asc');
      return column;
    });
  }, []);

  const runBulkAction = useCallback(
    async (action: BulkAction) => {
      if (selectedIds.length === 0) return;
      setProcessing(true);
      setError(null);
      try {
        switch (action.type) {
          case 'status': {
            const status = action.payload as ContactStatus;
            await Promise.all(
              selectedIds.map((id) =>
                fetch(`/api/contacts/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status }),
                })
              )
            );
            break;
          }
          case 'delete': {
            await Promise.all(
              selectedIds.map((id) =>
                fetch(`/api/contacts/${id}`, {
                  method: 'DELETE',
                })
              )
            );
            break;
          }
          case 'assign-list': {
            // Placeholder: will integrate once list endpoints exist
            break;
          }
        }
        clearSelection();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bulk action failed');
      } finally {
        setProcessing(false);
      }
    },
    [selectedIds, clearSelection]
  );

  return {
    contacts: filteredContacts,
    filters,
    sortBy,
    sortDirection,
    selectedIds,
    lists,
    processing,
    error,
    groupByCanton,
    toggleGroupByCanton: () => setGroupByCanton((prev) => !prev),
    applyFilters,
    applySort,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    runBulkAction,
  };
}

