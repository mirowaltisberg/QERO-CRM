"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import type { ContactCreateInput } from "@/lib/validation/schemas";
import { SWISS_CANTONS, type SwissCanton } from "@/lib/utils/constants";

interface ContactsImporterProps {
  onImportComplete?: () => void;
}

type CsvRow = Record<string, string>;

// Batch size for importing - prevents timeout
const BATCH_SIZE = 200;

export function ContactsImporter({ onImportComplete }: ContactsImporterProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setMessage("Verarbeite CSV…");
    setProgress(null);

    try {
      // Parse CSV
      const results = await new Promise<Papa.ParseResult<CsvRow>>((resolve, reject) => {
        Papa.parse<CsvRow>(file, {
          header: true,
          skipEmptyLines: true,
          complete: resolve,
          error: reject,
        });
      });

      const mapped = results.data
        .map(mapRowToContact)
        .filter<ContactCreateInput>((contact): contact is ContactCreateInput => Boolean(contact));

      if (mapped.length === 0) {
        setStatus("error");
        setMessage("Keine gültigen Firmen im CSV gefunden.");
        return;
      }

      // Split into batches to avoid timeout
      const batches = chunkArray(mapped, BATCH_SIZE);
      let totalCreated = 0;
      let totalErrors = 0;

      setMessage(`Importiere ${mapped.length} Firmen…`);
      setProgress({ current: 0, total: mapped.length });

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        try {
          const response = await fetch("/api/contacts/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contacts: batch }),
          });
          
          if (!response.ok) {
            const json = await response.json().catch(() => ({}));
            console.error(`Batch ${i + 1} failed:`, json.error);
            totalErrors += batch.length;
          } else {
            const json = await response.json();
            totalCreated += json.created?.length ?? batch.length;
            totalErrors += json.errors?.length ?? 0;
          }
        } catch (err) {
          console.error(`Batch ${i + 1} error:`, err);
          totalErrors += batch.length;
        }

        // Update progress
        const processed = Math.min((i + 1) * BATCH_SIZE, mapped.length);
        setProgress({ current: processed, total: mapped.length });
        setMessage(`${processed} / ${mapped.length} Firmen…`);
        
        // Small delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      // Done!
      setStatus("success");
      setProgress(null);
      
      const successMsg = `✓ ${totalCreated.toLocaleString()} Firmen importiert!`;
      const errorMsg = totalErrors > 0 ? ` (${totalErrors} Fehler)` : "";
      setMessage(successMsg + errorMsg);

      // Notify parent and refresh the page data
      onImportComplete?.();
      router.refresh();

    } catch (error) {
      console.error("Import error:", error);
      setStatus("error");
      setProgress(null);
      setMessage(error instanceof Error ? error.message : "Import fehlgeschlagen");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
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
      
      {progress && (
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gray-900 transition-all duration-150"
              style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 tabular-nums">
            {Math.round((progress.current / progress.total) * 100)}%
          </span>
        </div>
      )}
      
      {message && (
        <p
          className="text-xs font-medium"
          style={{
            color: status === "error" ? "#dc2626" : status === "success" ? "#16a34a" : "#6b7280",
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

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
