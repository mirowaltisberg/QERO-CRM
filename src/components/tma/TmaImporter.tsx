"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import type { SwissCanton, TmaStatus } from "@/lib/utils/constants";
import { SWISS_CANTONS, TMA_STATUS } from "@/lib/utils/constants";
import type { TmaCreateInput } from "@/lib/validation/schemas";

interface CsvRow {
  [key: string]: string;
}

interface Props {
  onImportComplete?: () => void;
}

export function TmaImporter({ onImportComplete }: Props) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setUploading(true);
    setMessage(null);

    Papa.parse<CsvRow>(file, {
      header: true,
      complete: async (results) => {
        const entries = results.data
          .map(mapRowToCandidate)
          .filter((row): row is TmaCreateInput => Boolean(row));

        try {
          const response = await fetch("/api/tma/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entries),
          });
          const json = await response.json();
          if (!response.ok) {
            throw new Error(json.error || "Import failed");
          }
          setMessage(`Imported ${json.data.created} candidates (${json.data.errors.length} errors)`);
          onImportComplete?.();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Import failed");
        } finally {
          setUploading(false);
        }
      },
      error: (error) => {
        setMessage(error.message);
        setUploading(false);
      },
    });
  };

  return (
    <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm">
      <p className="font-medium text-gray-900">Import CSV</p>
      <p className="text-xs text-gray-500">Headers: Vorname, Nachname, Telefon, Email, Kanton, Status (A/B/C), Notizen</p>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white">
        <input
          type="file"
          accept=".csv"
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {uploading ? "Uploading…" : "Upload CSV"}
      </label>
      {message && <p className="mt-2 text-xs text-gray-500">{message}</p>}
    </div>
  );
}

function mapRowToCandidate(row: CsvRow): TmaCreateInput | null {
  const firstName = (row["Vorname"] || row["First Name"] || "").trim();
  const lastName = (row["Nachname"] || row["Last Name"] || "").trim();
  if (!firstName || !lastName) return null;

  const status = normalizeStatus(row["Status"] || row["Kategorie"]);

  return {
    first_name: firstName,
    last_name: lastName,
    phone: (row["Telefon"] || row["Phone"] || "").trim() || null,
    email: (row["Email"] || row["E-Mail"] || "").trim() || null,
    canton: formatCanton(row["Kanton"] || row["Canton"]),
    status,
    notes: (row["Notizen"] || row["Notes"] || "").trim() || null,
  };
}

function normalizeStatus(value: string | undefined): TmaStatus {
  const upper = (value || "").toUpperCase();
  if (upper === "A" || upper === "B" || upper === "C") return upper as TmaStatus;
  return TMA_STATUS.B;
}

function formatCanton(value: string | undefined): SwissCanton | null {
  if (!value) return null;
  const code = value.trim().slice(0, 2).toUpperCase();
  return SWISS_CANTONS.includes(code as SwissCanton) ? (code as SwissCanton) : null;
}

