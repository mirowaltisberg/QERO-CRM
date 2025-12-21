"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Admin emails - keep in sync with cleanup-auth.ts
const ADMIN_EMAILS = ["shtanaj@qero.ch", "m.waltisberg@qero.ch"];

interface OutlookSyncButtonProps {
  userEmail: string | null;
  onSyncComplete?: () => void;
}

interface SyncResult {
  imported: number;
  skipped: number;
  errors: string[];
  duplicateReasons?: {
    phone: number;
    email_domain: number;
    name: number;
    already_imported: number;
  };
  totalFromGraph?: number;
}

interface AdminSyncResult {
  totalAccounts: number;
  totalImported: number;
  totalSkipped: number;
  accountsWithErrors: number;
  details: Array<{
    mailbox: string;
    teamId: string | null;
    imported: number;
    skipped: number;
    error: string | null;
  }>;
}

export function OutlookSyncButton({ userEmail, onSyncComplete }: OutlookSyncButtonProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [adminSyncing, setAdminSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error" | "warning">("idle");
  
  const isAdmin = userEmail ? ADMIN_EMAILS.includes(userEmail.toLowerCase().trim()) : false;

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setMessage("Synchronisiere Outlook-Kontakte…");
    setStatus("idle");

    try {
      const response = await fetch("/api/contacts/outlook/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = await response.json();

      if (!response.ok) {
        setStatus("error");
        if (response.status === 401) {
          setMessage("Outlook-Verbindung abgelaufen. Bitte in Einstellungen neu verbinden.");
        } else if (response.status === 400) {
          setMessage("Kein Outlook-Konto verbunden. Bitte in Einstellungen verbinden.");
        } else {
          setMessage(json.error || "Synchronisierung fehlgeschlagen");
        }
        return;
      }

      const result: SyncResult = json.data;
      
      if (result.errors && result.errors.length > 0) {
        setStatus("warning");
        setMessage(
          `${result.imported} importiert, ${result.skipped} übersprungen (${result.errors.length} Fehler)`
        );
      } else if (result.imported === 0) {
        setStatus("success");
        setMessage(`Keine neuen Kontakte (${result.skipped} bereits vorhanden)`);
      } else {
        setStatus("success");
        setMessage(`✓ ${result.imported} neue Kontakte importiert`);
      }

      onSyncComplete?.();
      router.refresh();
    } catch (error) {
      console.error("Outlook sync error:", error);
      setStatus("error");
      setMessage("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setSyncing(false);
    }
  }, [onSyncComplete, router]);

  const handleAdminSync = useCallback(async () => {
    if (!isAdmin) return;
    
    setAdminSyncing(true);
    setMessage("Synchronisiere alle Teams…");
    setStatus("idle");

    try {
      const response = await fetch("/api/admin/contacts/outlook/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(json.error || "Admin-Synchronisierung fehlgeschlagen");
        return;
      }

      const result: AdminSyncResult = json.data;
      
      if (result.accountsWithErrors > 0) {
        setStatus("warning");
        setMessage(
          `${result.totalImported} importiert aus ${result.totalAccounts} Konten (${result.accountsWithErrors} mit Fehlern)`
        );
      } else {
        setStatus("success");
        setMessage(
          `✓ ${result.totalImported} importiert aus ${result.totalAccounts} Konten`
        );
      }

      onSyncComplete?.();
      router.refresh();
    } catch (error) {
      console.error("Admin sync error:", error);
      setStatus("error");
      setMessage("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setAdminSyncing(false);
    }
  }, [isAdmin, onSyncComplete, router]);

  const isDisabled = syncing || adminSyncing;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSync}
          disabled={isDisabled}
          title="Kontakte aus meinem Outlook importieren"
        >
          {syncing ? "Synchronisiere…" : "Outlook Sync"}
        </Button>
        
        {isAdmin && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAdminSync}
            disabled={isDisabled}
            title="Alle Teams synchronisieren (Admin)"
            className="bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200"
          >
            {adminSyncing ? "Synchronisiere alle…" : "Alle Teams"}
          </Button>
        )}
      </div>

      {message && (
        <p
          className="text-xs font-medium max-w-[280px] text-right"
          style={{
            color:
              status === "error"
                ? "#dc2626"
                : status === "warning"
                ? "#d97706"
                : status === "success"
                ? "#16a34a"
                : "#6b7280",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

