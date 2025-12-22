"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OutlookFolderPickerModal } from "./OutlookFolderPickerModal";

// Admin emails - keep in sync with cleanup-auth.ts
const ADMIN_EMAILS = ["shtanaj@qero.ch", "m.waltisberg@qero.ch"];

interface OutlookSyncButtonProps {
  userEmail: string | null;
  onSyncComplete?: () => void;
}

interface SyncResult {
  imported: number;
  skipped: number;
  updated?: number;
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
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  
  const isAdmin = userEmail ? ADMIN_EMAILS.includes(userEmail.toLowerCase().trim()) : false;

  // Handle folder-based import
  const handleFolderImport = useCallback(async (folders: Array<{ folderId: string; specialization: string | null }>) => {
    setSyncing(true);
    setMessage("Importiere aus ausgewählten Ordnern…");
    setStatus("idle");

    try {
      const response = await fetch("/api/contacts/outlook/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders }),
      });

      const json = await response.json();

      if (!response.ok) {
        setStatus("error");
        if (response.status === 401) {
          setMessage("Outlook-Verbindung abgelaufen. Bitte in Einstellungen neu verbinden.");
        } else if (response.status === 400) {
          setMessage("Kein Outlook-Konto verbunden. Bitte in Einstellungen verbinden.");
        } else {
          setMessage(json.error || "Import fehlgeschlagen");
        }
        throw new Error(json.error || "Import failed");
      }

      const result: SyncResult = json.data;
      
      if (result.errors && result.errors.length > 0) {
        setStatus("warning");
        setMessage(
          `${result.imported} importiert, ${result.updated || 0} aktualisiert, ${result.skipped} übersprungen (${result.errors.length} Fehler)`
        );
      } else if (result.imported === 0 && (result.updated || 0) === 0) {
        setStatus("success");
        setMessage(`Keine neuen Kontakte (${result.skipped} bereits vorhanden)`);
      } else {
        setStatus("success");
        const parts = [];
        if (result.imported > 0) parts.push(`${result.imported} importiert`);
        if ((result.updated || 0) > 0) parts.push(`${result.updated} aktualisiert`);
        setMessage(`✓ ${parts.join(", ")}`);
      }

      onSyncComplete?.();
      router.refresh();
    } catch (error) {
      console.error("Outlook folder import error:", error);
      if (status === "idle") {
        setStatus("error");
        setMessage("Verbindungsfehler. Bitte erneut versuchen.");
      }
      throw error;
    } finally {
      setSyncing(false);
    }
  }, [onSyncComplete, router, status]);

  // Legacy sync (all contacts via delta)
  const handleLegacySync = useCallback(async () => {
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

  // Admin sync all teams
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
    <>
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {/* Folder-based import (primary) */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowFolderPicker(true)}
            disabled={isDisabled}
            title="Kontakte aus Outlook-Ordnern importieren"
          >
            {syncing ? "Importiere…" : "Outlook Import"}
          </Button>

          {/* Legacy delta sync (secondary) */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLegacySync}
            disabled={isDisabled}
            title="Alle neuen Outlook-Kontakte synchronisieren (Delta)"
          >
            {syncing ? "Sync…" : "Quick Sync"}
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

      {/* Folder picker modal */}
      <OutlookFolderPickerModal
        isOpen={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        onImport={handleFolderImport}
      />
    </>
  );
}
