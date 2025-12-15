"use client";

import { useState } from "react";
import Papa from "papaparse";
import type { SwissCanton, TmaStatus } from "@/lib/utils/constants";
import { SWISS_CANTONS } from "@/lib/utils/constants";
import type { TmaCreateInput } from "@/lib/validation/schemas";
import { dedupeCandidateRows } from "@/lib/tma/dedupe";

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

        const uniqueRows = dedupeCandidateRows(parsedRows);

        try {
        const response = await fetch("/api/tma/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(uniqueRows),
          });
          const json = await response.json();
          if (!response.ok) {
          throw new Error(json.error || json.data?.errors?.[0]?.message || "Import failed");
          }
          const deduped = parsedRows.length - uniqueRows.length;
          const dedupeNote = deduped > 0 ? ` (${deduped} duplicates skipped)` : "";
        const errorNote =
          json.data.errors.length > 0 ? ` (first error: ${json.data.errors[0].message})` : "";
        setMessage(
          `Imported ${json.data.created} candidates (${json.data.errors.length} errors)${dedupeNote}${errorNote}`
        );
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
    <div className="w-full max-w-xs rounded-2xl border border-dashed border-gray-200 p-4 text-xs text-gray-600 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">Import CSV</p>
      <p className="mt-1 text-[11px] text-gray-500">Drag a CSV to quickly add candidates. Headers can match Companies export.</p>
      <label className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white">
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
      {message && <p className="mt-2 text-[11px] text-gray-500">{message}</p>}
    </div>
  );
}

function mapRowToCandidate(row: CsvRow): TmaCreateInput | null {
  const firstName = (row["Vorname"] || row["First Name"] || "").trim();
  const lastName = (row["Nachname"] || row["Last Name"] || "").trim();
  if (!firstName || !lastName) return null;

  const statusTags = normalizeStatusTags(row["Status"] || row["Kategorie"]);
  const status = statusTags[0] ?? null;
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
  const position =
    row["Beruf"] ||
    row["Position"] ||
    row["Job"] ||
    row["Funktion"] ||
    row["Role"] ||
    row["Titel"];
  const shortProfile =
    row["Short Profile"] ||
    row["Short-Profile"] ||
    row["Kurzprofil"] ||
    row["Profil"];
  const city =
    row["Ort geschäftlich"] ||
    row["Ort geschaeftlich"] ||
    row["Ort (geschäftlich)"] ||
    row["Ort privat"] ||
    row["Ort (privat)"] ||
    row["Ort"] ||
    row["Wohnort"] ||
    row["Stadt"] ||
    row["City"] ||
    row["Region privat"];
  const street =
    row["Straße geschäftlich"] ||
    row["Strasse geschäftlich"] ||
    row["Straße privat"] ||
    row["Strasse privat"] ||
    row["Straße"] ||
    row["Strasse"] ||
    row["Adresse"] ||
    row["Adresse (privat)"] ||
    row["Adresse (geschäftlich)"] ||
    row["Street"] ||
    row["Address"];
  const postalCode =
    row["Postleitzahl geschäftlich"] ||
    row["Postleitzahl privat"] ||
    row["PLZ (geschäftlich)"] ||
    row["PLZ (privat)"] ||
    row["PLZ"] ||
    row["Postleitzahl"] ||
    row["Zip"] ||
    row["Postal Code"];

  // Collect ALL phone numbers from various fields and combine them
  const phoneFields = [
    row["Telefon geschäftlich"],
    row["Telefon geschaeftlich"],
    row["Telefon privat"],
    row["Mobiltelefon"],
    row["Handy"],
    row["Mobile"],
    row["Telefon"],
    row["Phone"],
    row["Tel"],
    row["Tel."],
    row["Telefonnummer"],
    row["Phone Number"],
    row["Mobile Phone"],
    row["Cell Phone"],
  ];
  
  // Filter out empty values, trim, and dedupe
  const uniquePhones = Array.from(
    new Set(
      phoneFields
        .filter((p): p is string => Boolean(p?.trim()))
        .map((p) => p.trim())
    )
  );
  
  // Join multiple phones with " / " separator
  const phone = uniquePhones.length > 0 ? uniquePhones.join(" / ") : null;

  return {
    first_name: firstName,
    last_name: lastName,
    phone,
    email: (row["Email"] || row["E-Mail"] || row["E-Mail-Adresse"] || "").trim() || null,
    canton: formatCanton(cantonSource),
    city: city?.trim() || null,
    street: street?.trim() || null,
    postal_code: postalCode?.trim() || null,
    position_title: position?.trim() || null,
    short_profile_url: shortProfile?.trim() || null,
    status,
    status_tags: statusTags,
    activity: null, // Default to null, can be set manually later
    notes: (row["Notizen"] || row["Notes"] || "").trim() || null,
  };
}

function normalizeStatusTags(value: string | undefined): TmaStatus[] {
  if (!value) return [];
  const matches = value.toUpperCase().match(/[ABC]/g) || [];
  const deduped = Array.from(new Set(matches.filter((token) => token === "A" || token === "B" || token === "C")));
  const order = ["A", "B", "C"] as const;
  return deduped.sort(
    (a, b) => order.indexOf(a as (typeof order)[number]) - order.indexOf(b as (typeof order)[number])
  ) as TmaStatus[];
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

