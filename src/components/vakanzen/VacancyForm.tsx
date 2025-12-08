"use client";

import { useState, useEffect, useMemo } from "react";
import type { Vacancy, VacancyUrgency, TmaRole, Team } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { TMA_STATUS_LIST } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";
import { UrgencySelector } from "./UrgencyBadge";
import { VacancyRoleDropdown } from "./VacancyRoleDropdown";

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
  team_id: string | null;
  team?: { id: string; name: string; color: string } | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Vacancy>) => void;
  contacts: ContactForVacancy[];
  vacancy?: Vacancy | null;
  roles: TmaRole[];
  teams: Team[];
  onCreateRole: (payload: { name: string; color: string; note?: string | null }) => Promise<TmaRole>;
  onRefreshRoles: () => Promise<void>;
}

export function VacancyForm({ isOpen, onClose, onSubmit, contacts, vacancy, roles, teams, onCreateRole, onRefreshRoles }: Props) {
  const isEditing = !!vacancy;
  
  // Form state
  const [contactId, setContactId] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [radiusKm, setRadiusKm] = useState(25);
  const [minQuality, setMinQuality] = useState<"A" | "B" | "C" | "">("");
  const [urgency, setUrgency] = useState<VacancyUrgency>(1);
  const [contactSearch, setContactSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset form when vacancy changes
  useEffect(() => {
    if (vacancy) {
      setContactId(vacancy.contact_id || "");
      setTitle(vacancy.title || "");
      setRole(vacancy.role || "");
      setDescription(vacancy.description || "");
      setCity(vacancy.city || "");
      setPostalCode(vacancy.postal_code || "");
      setRadiusKm(vacancy.radius_km || 25);
      setMinQuality(vacancy.min_quality || "");
      setUrgency(vacancy.urgency || 1);
    } else {
      setContactId("");
      setTitle("");
      setRole("");
      setDescription("");
      setCity("");
      setPostalCode("");
      setRadiusKm(25);
      setMinQuality("");
      setUrgency(1);
    }
    setContactSearch("");
  }, [vacancy, isOpen]);

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.slice(0, 50);
    const query = contactSearch.toLowerCase();
    return contacts
      .filter(c => 
        c.company_name?.toLowerCase().includes(query) ||
        c.city?.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [contacts, contactSearch]);

  // Selected contact
  const selectedContact = contacts.find(c => c.id === contactId);

  // Auto-fill location from selected contact
  useEffect(() => {
    if (selectedContact && !city && !postalCode) {
      setCity(selectedContact.city || "");
      setPostalCode(selectedContact.postal_code || "");
    }
  }, [selectedContact, city, postalCode]);

  const handleSubmit = async () => {
    if (!contactId || !title.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        contact_id: contactId,
        title: title.trim(),
        role: role.trim() || null,
        description: description.trim() || null,
        city: city.trim() || null,
        postal_code: postalCode.trim() || null,
        latitude: selectedContact?.latitude || null,
        longitude: selectedContact?.longitude || null,
        radius_km: radiusKm,
        min_quality: minQuality || null,
        urgency,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEditing ? "Vakanz bearbeiten" : "Neue Vakanz erstellen"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!contactId || !title.trim() || submitting}
            loading={submitting}
          >
            {isEditing ? "Speichern" : "Erstellen"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Company Selection */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Firma *
          </label>
          {selectedContact ? (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{selectedContact.company_name}</p>
                <p className="text-xs text-gray-500">
                  {selectedContact.city}
                  {selectedContact.canton && ` ${selectedContact.canton}`}
                </p>
              </div>
              <button
                onClick={() => setContactId("")}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Ändern
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Firma suchen..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-0"
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                {filteredContacts.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-gray-500">
                    Keine Firmen gefunden
                  </p>
                ) : (
                  filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => setContactId(contact.id)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="font-medium text-gray-900">{contact.company_name}</p>
                      <p className="text-xs text-gray-500">
                        {contact.city}
                        {contact.canton && ` ${contact.canton}`}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Stellentitel *
          </label>
          <input
            type="text"
            placeholder="z.B. Elektroinstallateur EFZ"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-0"
          />
        </div>

        {/* Role (for matching) */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Rolle (für TMA-Matching)
          </label>
          <VacancyRoleDropdown
            value={role || null}
            roles={roles}
            teams={teams}
            onChange={(roleName) => setRole(roleName || "")}
            onCreateRole={onCreateRole}
            onRefreshRoles={onRefreshRoles}
            placeholder="Rolle auswählen..."
          />
          <p className="mt-1 text-xs text-gray-400">
            Wird verwendet um passende TMA-Kandidaten vorzuschlagen
          </p>
        </div>

        {/* Location */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Stadt
            </label>
            <input
              type="text"
              placeholder="z.B. Zürich"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-0"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              PLZ
            </label>
            <input
              type="text"
              placeholder="z.B. 8001"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-0"
            />
          </div>
        </div>

        {/* Radius */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Suchradius: {radiusKm} km
          </label>
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={radiusKm}
            onChange={(e) => setRadiusKm(parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>5 km</span>
            <span>100 km</span>
          </div>
        </div>

        {/* Min Quality */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Mindest-Qualität
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setMinQuality("")}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium border transition-colors",
                minQuality === ""
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              )}
            >
              Alle
            </button>
            {TMA_STATUS_LIST.map((status) => (
              <button
                key={status}
                onClick={() => setMinQuality(status)}
                className={cn(
                  "flex-1 rounded-lg py-2 text-sm font-medium border transition-colors",
                  minQuality === status
                    ? status === "A" ? "bg-green-500 text-white border-green-500" :
                      status === "B" ? "bg-amber-500 text-white border-amber-500" :
                      "bg-red-500 text-white border-red-500"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                )}
              >
                {status}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Nur Kandidaten mit dieser Qualität oder besser werden vorgeschlagen
          </p>
        </div>

        {/* Urgency */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Dringlichkeit
          </label>
          <UrgencySelector value={urgency} onChange={setUrgency} />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Beschreibung
          </label>
          <textarea
            placeholder="Zusätzliche Informationen zur Stelle..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-0 resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}
