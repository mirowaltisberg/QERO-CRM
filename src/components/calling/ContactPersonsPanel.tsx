"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { ContactPerson } from "@/lib/types";

interface ContactPersonsPanelProps {
  contactId: string;
}

interface FormState {
  first_name: string;
  last_name: string;
  role: string;
  mobile: string;
  direct_phone: string;
  email: string;
}

const emptyForm: FormState = {
  first_name: "",
  last_name: "",
  role: "",
  mobile: "",
  direct_phone: "",
  email: "",
};

export function ContactPersonsPanel({ contactId }: ContactPersonsPanelProps) {
  const [persons, setPersons] = useState<ContactPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingPerson, setEditingPerson] = useState<ContactPerson | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadPersons = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/contacts/${contactId}/persons`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to load contact persons");
      }
      setPersons(json.data ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load contact persons");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    loadPersons();
  }, [loadPersons]);

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const openModal = (person?: ContactPerson) => {
    if (person) {
      setEditingPerson(person);
      setForm({
        first_name: person.first_name ?? "",
        last_name: person.last_name ?? "",
        role: person.role ?? "",
        mobile: person.mobile ?? "",
        direct_phone: person.direct_phone ?? "",
        email: person.email ?? "",
      });
    } else {
      setEditingPerson(null);
      setForm(emptyForm);
    }
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError(null);
    setSaving(false);
  };

  const buildPayload = () => ({
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    role: form.role.trim() || null,
    mobile: form.mobile.trim() || null,
    direct_phone: form.direct_phone.trim() || null,
    email: form.email.trim() || null,
  });

  const handleSubmit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const payload = buildPayload();
      const endpoint = editingPerson
        ? `/api/contacts/${contactId}/persons/${editingPerson.id}`
        : `/api/contacts/${contactId}/persons`;
      const method = editingPerson ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to save contact person");
      }
      await loadPersons();
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save contact person");
      setSaving(false);
    }
  };

  const handleDelete = async (person: ContactPerson) => {
    if (!confirm(`Delete ${person.first_name} ${person.last_name}?`)) return;
    try {
      const response = await fetch(`/api/contacts/${contactId}/persons/${person.id}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to delete contact person");
      }
      await loadPersons();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete contact person");
    }
  };

  const description = useMemo(() => {
    if (loading) return "Lädt Ansprechpersonen...";
    if (loadError) return "Fehler beim Laden";
    if (persons.length === 0) return "Noch keine Ansprechpersonen hinterlegt";
    return `${persons.length} Ansprechperson${persons.length === 1 ? "" : "en"}`;
  }, [loading, loadError, persons.length]);

  return (
    <>
      <Panel
        title="Ansprechpersonen"
        description={description}
        actions={
          <Button size="sm" onClick={() => openModal()}>
            + Neue Ansprechperson
          </Button>
        }
      >
        {loading && <div className="text-sm text-gray-500">Lädt Ansprechpersonen...</div>}
        {loadError && <div className="text-sm text-red-500">{loadError}</div>}
        {!loading && !loadError && persons.length === 0 && (
          <div className="text-sm text-gray-500">Noch keine Ansprechpersonen vorhanden.</div>
        )}
        {!loading && !loadError && persons.length > 0 && (
          <div className="space-y-3">
            {persons.map((person) => (
              <div
                key={person.id}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {person.first_name} {person.last_name}
                    </p>
                    {person.role && <p className="text-sm text-gray-500">{person.role}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openModal(person)}>
                      Bearbeiten
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500"
                      onClick={() => handleDelete(person)}
                    >
                      Löschen
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-3">
                  <InfoItem label="Mobile" value={person.mobile ?? "-"} />
                  <InfoItem label="Direkt" value={person.direct_phone ?? "-"} />
                  <InfoItem label="E-Mail" value={person.email ?? "-"} />
                </div>
                <p className="mt-3 text-xs text-gray-400">{formatUpdatedMeta(person)}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal open={isModalOpen} onClose={closeModal}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {editingPerson ? "Ansprechperson bearbeiten" : "Neue Ansprechperson"}
            </h3>
            <p className="text-sm text-gray-500">
              Hinterlege eine oder mehrere Ansprechpersonen für dieses Unternehmen.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <InputField label="Vorname" value={form.first_name} onChange={handleChange("first_name")} required />
            <InputField label="Nachname" value={form.last_name} onChange={handleChange("last_name")} required />
            <InputField label="Rolle" value={form.role} onChange={handleChange("role")} />
            <InputField label="E-Mail" value={form.email} onChange={handleChange("email")} type="email" />
            <InputField label="Mobile" value={form.mobile} onChange={handleChange("mobile")} />
            <InputField label="Direktnummer" value={form.direct_phone} onChange={handleChange("direct_phone")} />
          </div>
          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

function InputField({
  label,
  required,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  type?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="text-xs font-medium uppercase text-gray-400">
      {label}
      {required && <span className="text-red-500"> *</span>}
      <Input type={type} value={value} onChange={onChange} className="mt-1" />
    </label>
  );
}

function formatUpdatedMeta(person: ContactPerson) {
  const editor = person.updated_by_profile?.full_name ?? "Unbekannt";
  const date = person.updated_at ? new Date(person.updated_at) : null;
  const formatted = date
    ? new Intl.DateTimeFormat("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
    : "Unbekannt";
  return `Zuletzt bearbeitet von ${editor} am ${formatted}`;
}
