"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import type { ContactCreateInput } from "@/lib/validation/schemas";
import type { Contact } from "@/lib/types";
import { SWISS_CANTONS, type SwissCanton } from "@/lib/utils/constants";

interface ContactsImporterProps {
  onImported?: (contacts: Contact[]) => void;
}

type CsvRow = Record<string, string>;

export function ContactsImporter({ onImported }: ContactsImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setMessage("Verarbeite CSV…");

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const mapped = results.data
            .map(mapRowToContact)
            .filter<ContactCreateInput>((contact): contact is ContactCreateInput => Boolean(contact));

          if (mapped.length === 0) {
            setStatus("error");
            setMessage("Keine gültigen Firmen im CSV gefunden.");
            return;
          }

          const response = await fetch("/api/contacts/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contacts: mapped }),
          });
          const json = await response.json();
          if (!response.ok) {
            throw new Error(json.error || "Import fehlgeschlagen");
          }

          const summary = json.created?.length ?? mapped.length;

          // refetch contacts so UI can update immediately
          const refreshed = await fetch("/api/contacts", { cache: "no-store" }).then((res) => res.json());
          onImported?.(refreshed.data ?? []);

          setStatus("success");
          setMessage(`Import abgeschlossen (${summary} Firmen).`);
          // no need to router.refresh, we control state client-side now
        } catch (error) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Import fehlgeschlagen");
        } finally {
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      },
      error(error) {
        setStatus("error");
        setMessage(error.message);
      },
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={status === "uploading"}
      >
        {status === "uploading" ? "Importiere…" : "CSV importieren"}
      </Button>
      {message && (
        <p
          className="text-xs"
          style={{
            color: status === "error" ? "#dc2626" : "#6b7280",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

function mapRowToContact(row: CsvRow): ContactCreateInput | null {
  const company = (row["Firma"] || row["Firma "] || "").trim();
  if (!company) return null;

  const cantonRaw = (row["Region geschäftlich"] || row["Bundesland/Kanton privat"] || "").trim();
  const canton = formatCanton(cantonRaw);

  const phone =
    coalesce(
      row["Telefon Firma"],
      row["Telefon geschäftlich"],
      row["Telefon geschäftlich 2"],
      row["Mobiltelefon"],
      row["Mobiltelefon 2"]
    ) ?? null;

  const email = coalesce(row["E-Mail-Adresse"], row["E-Mail 2: Adresse"], row["E-Mail 3: Adresse"]) ?? null;
  const notes = [row["Rückmeldung"], row["Notizen"]].filter(Boolean).join("\n").trim() || null;

  return {
    company_name: company,
    contact_name: `${company} Hiring Team`,
    phone,
    email,
    canton,
    notes,
    status: "new",
  };
}

function formatCanton(value: string | undefined): SwissCanton | null {
  if (!value) return null;
  const code = value.slice(0, 2).toUpperCase();
  // Validate that it's a valid Swiss canton code
  if (SWISS_CANTONS.includes(code as SwissCanton)) {
    return code as SwissCanton;
  }
  return null;
}

function coalesce(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
