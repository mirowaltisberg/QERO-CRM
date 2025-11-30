"use client";

import { useState } from "react";
import Papa from "papaparse";
import type { SwissCanton, TmaStatus } from "@/lib/utils/constants";
import { SWISS_CANTONS } from "@/lib/utils/constants";
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
        const parsedRows = results.data
          .map(mapRowToCandidate)
          .filter((row): row is TmaCreateInput => Boolean(row));

        if (parsedRows.length === 0) {
          setMessage("No valid candidates found in CSV.");
          setUploading(false);
          return;
        }

        const uniqueRows = dedupeCandidates(parsedRows);

        try {
          const response = await fetch("/api/tma/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(uniqueRows),
          });
          const json = await response.json();
          if (!response.ok) {
            throw new Error(json.error || "Import failed");
          }
          const deduped = parsedRows.length - uniqueRows.length;
          const dedupeNote = deduped > 0 ? ` (${deduped} duplicates skipped)` : "";
          setMessage(`Imported ${json.data.created} candidates (${json.data.errors.length} errors)${dedupeNote}`);
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
  const cantonSource =
    row["Kantonskürzel"] ||
    row["Kantonskuerzel"] ||
    row["Kantonskurzel"] ||
    row["Kantonskürzel "] ||
    row["Kantonskuerzel "] ||
    row["Kantonskurzel "] ||
    row["Kanton"] ||
    row["Canton"] ||
    row["Region geschäftlich"] ||
    row["Region geschaeftlich"] ||
    row["Bundesland/Kanton privat"] ||
    row["Weiteres/r Bundesland/Kanton"];

  return {
    first_name: firstName,
    last_name: lastName,
    phone: (row["Telefon"] || row["Phone"] || "").trim() || null,
    email: (row["Email"] || row["E-Mail"] || "").trim() || null,
    canton: formatCanton(cantonSource),
    status,
    notes: (row["Notizen"] || row["Notes"] || "").trim() || null,
  };
}

function normalizeStatus(value: string | undefined): TmaStatus | null {
  const upper = (value || "").toUpperCase().trim();
  if (upper === "A" || upper === "B" || upper === "C") return upper as TmaStatus;
  return null;
}

const CANTON_NAME_MAP: Record<string, SwissCanton> = {
  AARGAU: "AG",
  "APPENZELL AUSSERRHODEN": "AR",
  "APPENZELL INNERRHODEN": "AI",
  BERN: "BE",
  "BASEL-LANDSCHAFT": "BL",
  "BASEL-STADT": "BS",
  BASEL: "BS",
  FRIBOURG: "FR",
  FREIBURG: "FR",
  GENEVA: "GE",
  GENF: "GE",
  GENEVE: "GE",
  GLARUS: "GL",
  GRAUBUENDEN: "GR",
  GRAUBÜNDEN: "GR",
  GRISONS: "GR",
  JURA: "JU",
  LUCERNE: "LU",
  LUZERN: "LU",
  NEUCHÂTEL: "NE",
  NEUCHATEL: "NE",
  NIDWALDEN: "NW",
  OBWALDEN: "OW",
  "ST. GALLEN": "SG",
  STGALLEN: "SG",
  SCHAFFHAUSEN: "SH",
  SOLOTHURN: "SO",
  SCHWYZ: "SZ",
  THURGAU: "TG",
  TICINO: "TI",
  TESSIN: "TI",
  URI: "UR",
  VAUD: "VD",
  WALLIS: "VS",
  VALAIS: "VS",
  ZUG: "ZG",
  ZÜRICH: "ZH",
  ZURICH: "ZH",
};

function formatCanton(value: string | undefined): SwissCanton | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (!upper) return null;

  if (SWISS_CANTONS.includes(upper as SwissCanton)) {
    return upper as SwissCanton;
  }

  if (CANTON_NAME_MAP[upper]) {
    return CANTON_NAME_MAP[upper];
  }

  for (const code of SWISS_CANTONS) {
    if (upper.includes(code)) {
      return code;
    }
  }

  return null;
}

function dedupeCandidates(rows: TmaCreateInput[]) {
  const seen = new Set<string>();
  const unique: TmaCreateInput[] = [];
  for (const row of rows) {
    const phoneKey = (row.phone ?? "").replace(/\D/g, "");
    const key = [
      row.first_name.trim().toLowerCase(),
      row.last_name.trim().toLowerCase(),
      phoneKey,
      row.email?.trim().toLowerCase() ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

