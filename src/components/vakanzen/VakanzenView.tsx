"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { Vacancy, VacancyCandidate, TmaCandidate } from "@/lib/types";
import type { VacancyStatus } from "@/lib/utils/constants";
import { VacancyList } from "./VacancyList";
import { VacancyDetail } from "./VacancyDetail";
import { VacancyForm } from "./VacancyForm";
import { CandidateMatches } from "./CandidateMatches";

// Simplified contact type for vacancy form
interface ContactForVacancy {
  id: string;
  company_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  canton: string | null;
  street: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  initialVacancies: Vacancy[];
  contacts: ContactForVacancy[];
}

interface CandidateData {
  assigned: VacancyCandidate[];
  suggested: (TmaCandidate & { distance_km: number; match_score: number })[];
}

export function VakanzenView({ initialVacancies, contacts }: Props) {
  // State
  const [vacancies, setVacancies] = useState<Vacancy[]>(initialVacancies);
  const [activeVacancy, setActiveVacancy] = useState<Vacancy | null>(null);
  const [candidates, setCandidates] = useState<CandidateData | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<VacancyStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editingVacancy, setEditingVacancy] = useState<Vacancy | null>(null);
  
  // Mobile
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail" | "candidates">("list");

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Filter vacancies
  const filteredVacancies = useMemo(() => {
    let filtered = vacancies;

    if (statusFilter) {
      filtered = filtered.filter(v => v.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.title.toLowerCase().includes(query) ||
        v.role?.toLowerCase().includes(query) ||
        v.city?.toLowerCase().includes(query) ||
        v.contact?.company_name?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [vacancies, statusFilter, searchQuery]);

  // Load candidates when vacancy is selected
  const loadCandidates = useCallback(async (vacancyId: string) => {
    setCandidatesLoading(true);
    try {
      const res = await fetch(`/api/vacancies/${vacancyId}/candidates`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data);
      }
    } catch (error) {
      console.error("Error loading candidates:", error);
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  // Select vacancy
  const selectVacancy = useCallback((id: string) => {
    const vacancy = vacancies.find(v => v.id === id) || null;
    setActiveVacancy(vacancy);
    if (vacancy) {
      loadCandidates(vacancy.id);
      if (isMobile) setMobileView("detail");
    }
  }, [vacancies, loadCandidates, isMobile]);

  // Create vacancy
  const handleCreate = useCallback(async (data: Partial<Vacancy>) => {
    try {
      const res = await fetch("/api/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const newVacancy = await res.json();
        setVacancies(prev => [newVacancy, ...prev]);
        setActiveVacancy(newVacancy);
        setFormOpen(false);
        if (isMobile) setMobileView("detail");
      }
    } catch (error) {
      console.error("Error creating vacancy:", error);
    }
  }, [isMobile]);

  // Update vacancy
  const handleUpdate = useCallback(async (data: Partial<Vacancy>) => {
    if (!editingVacancy) return;
    try {
      const res = await fetch(`/api/vacancies/${editingVacancy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setVacancies(prev => prev.map(v => v.id === updated.id ? updated : v));
        if (activeVacancy?.id === updated.id) setActiveVacancy(updated);
        setEditingVacancy(null);
        setFormOpen(false);
      }
    } catch (error) {
      console.error("Error updating vacancy:", error);
    }
  }, [editingVacancy, activeVacancy]);

  // Delete vacancy
  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/vacancies/${id}`, { method: "DELETE" });
      if (res.ok) {
        setVacancies(prev => prev.filter(v => v.id !== id));
        if (activeVacancy?.id === id) {
          setActiveVacancy(null);
          setCandidates(null);
        }
        if (isMobile) setMobileView("list");
      }
    } catch (error) {
      console.error("Error deleting vacancy:", error);
    }
  }, [activeVacancy, isMobile]);

  // Update vacancy status
  const handleStatusChange = useCallback(async (status: VacancyStatus) => {
    if (!activeVacancy) return;
    try {
      const res = await fetch(`/api/vacancies/${activeVacancy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setVacancies(prev => prev.map(v => v.id === updated.id ? updated : v));
        setActiveVacancy(updated);
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  }, [activeVacancy]);

  // Add candidate to vacancy
  const handleAddCandidate = useCallback(async (tmaId: string) => {
    if (!activeVacancy) return;
    try {
      const res = await fetch(`/api/vacancies/${activeVacancy.id}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tma_id: tmaId, status: "contacted" }),
      });
      if (res.ok) {
        loadCandidates(activeVacancy.id);
      }
    } catch (error) {
      console.error("Error adding candidate:", error);
    }
  }, [activeVacancy, loadCandidates]);

  // Update candidate status
  const handleUpdateCandidateStatus = useCallback(async (tmaId: string, status: string) => {
    if (!activeVacancy) return;
    try {
      const res = await fetch(`/api/vacancies/${activeVacancy.id}/candidates/${tmaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        loadCandidates(activeVacancy.id);
      }
    } catch (error) {
      console.error("Error updating candidate:", error);
    }
  }, [activeVacancy, loadCandidates]);

  // Remove candidate
  const handleRemoveCandidate = useCallback(async (tmaId: string) => {
    if (!activeVacancy) return;
    try {
      const res = await fetch(`/api/vacancies/${activeVacancy.id}/candidates/${tmaId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadCandidates(activeVacancy.id);
      }
    } catch (error) {
      console.error("Error removing candidate:", error);
    }
  }, [activeVacancy, loadCandidates]);

  // Open edit form
  const openEditForm = useCallback((vacancy: Vacancy) => {
    setEditingVacancy(vacancy);
    setFormOpen(true);
  }, []);

  // Mobile back
  const handleMobileBack = useCallback(() => {
    if (mobileView === "candidates") {
      setMobileView("detail");
    } else {
      setMobileView("list");
    }
  }, [mobileView]);

  // Mobile: show candidates panel
  const handleShowCandidates = useCallback(() => {
    setMobileView("candidates");
  }, []);

  return (
    <div className="flex h-full">
      {/* Vacancy Form Modal */}
      <VacancyForm
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingVacancy(null);
        }}
        onSubmit={editingVacancy ? handleUpdate : handleCreate}
        contacts={contacts}
        vacancy={editingVacancy}
      />

      {/* Desktop Layout */}
      {!isMobile && (
        <>
          {/* List */}
          <VacancyList
            vacancies={filteredVacancies}
            activeId={activeVacancy?.id || null}
            onSelect={selectVacancy}
            onCreateNew={() => setFormOpen(true)}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          {/* Detail */}
          {activeVacancy ? (
            <VacancyDetail
              vacancy={activeVacancy}
              onEdit={() => openEditForm(activeVacancy)}
              onDelete={() => handleDelete(activeVacancy.id)}
              onStatusChange={handleStatusChange}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-gray-50">
              <p className="text-sm text-gray-400">Wähle eine Vakanz aus</p>
            </div>
          )}

          {/* Candidates Panel */}
          {activeVacancy && (
            <CandidateMatches
              vacancy={activeVacancy}
              candidates={candidates}
              loading={candidatesLoading}
              onAddCandidate={handleAddCandidate}
              onUpdateStatus={handleUpdateCandidateStatus}
              onRemove={handleRemoveCandidate}
            />
          )}
        </>
      )}

      {/* Mobile Layout */}
      {isMobile && (
        <div className="relative flex h-full w-full overflow-hidden">
          {/* List View */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out"
            style={{
              transform: mobileView === "list" ? "translateX(0)" : "translateX(-100%)",
            }}
          >
            <VacancyList
              vacancies={filteredVacancies}
              activeId={activeVacancy?.id || null}
              onSelect={selectVacancy}
              onCreateNew={() => setFormOpen(true)}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              isMobile
            />
          </div>

          {/* Detail View */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out"
            style={{
              transform: mobileView === "detail" ? "translateX(0)" : 
                         mobileView === "list" ? "translateX(100%)" : "translateX(-100%)",
            }}
          >
            {activeVacancy && (
              <VacancyDetail
                vacancy={activeVacancy}
                onEdit={() => openEditForm(activeVacancy)}
                onDelete={() => handleDelete(activeVacancy.id)}
                onStatusChange={handleStatusChange}
                onBack={handleMobileBack}
                onShowCandidates={handleShowCandidates}
                candidateCount={candidates?.assigned.length || 0}
                isMobile
              />
            )}
          </div>

          {/* Candidates View */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out"
            style={{
              transform: mobileView === "candidates" ? "translateX(0)" : "translateX(100%)",
            }}
          >
            {activeVacancy && (
              <CandidateMatches
                vacancy={activeVacancy}
                candidates={candidates}
                loading={candidatesLoading}
                onAddCandidate={handleAddCandidate}
                onUpdateStatus={handleUpdateCandidateStatus}
                onRemove={handleRemoveCandidate}
                onBack={handleMobileBack}
                isMobile
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
