"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Loader2, Folder, Check, ChevronDown } from "lucide-react";
import {
  SPECIALIZATION_OPTIONS,
  getSpecializationLabel,
  getSpecializationColor,
} from "@/lib/utils/outlook-specialization";

interface OutlookFolder {
  id: string;
  displayName: string;
  parentFolderId: string | null;
  suggestedSpecialization: string | null;
}

interface SelectedFolder {
  folderId: string;
  displayName: string;
  specialization: string | null;
}

interface OutlookFolderPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (folders: Array<{ folderId: string; specialization: string | null }>) => Promise<void>;
}

export function OutlookFolderPickerModal({
  isOpen,
  onClose,
  onImport,
}: OutlookFolderPickerModalProps) {
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState<OutlookFolder[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<SelectedFolder[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailbox, setMailbox] = useState<string | null>(null);

  // Fetch folders when modal opens
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      setSelectedFolders([]);
      
      fetch("/api/contacts/outlook/folders")
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.error || "Failed to fetch folders");
          }
          setFolders(json.data.folders);
          setMailbox(json.data.mailbox);
        })
        .catch((err) => {
          console.error("Error fetching folders:", err);
          setError(err.message || "Fehler beim Laden der Ordner");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen]);

  // Toggle folder selection
  const toggleFolder = useCallback((folder: OutlookFolder) => {
    setSelectedFolders((prev) => {
      const exists = prev.find((f) => f.folderId === folder.id);
      if (exists) {
        return prev.filter((f) => f.folderId !== folder.id);
      }
      return [
        ...prev,
        {
          folderId: folder.id,
          displayName: folder.displayName,
          specialization: folder.suggestedSpecialization,
        },
      ];
    });
  }, []);

  // Update specialization for a selected folder
  const updateSpecialization = useCallback((folderId: string, specialization: string | null) => {
    setSelectedFolders((prev) =>
      prev.map((f) =>
        f.folderId === folderId ? { ...f, specialization } : f
      )
    );
  }, []);

  // Handle import
  const handleImport = useCallback(async () => {
    if (selectedFolders.length === 0) return;
    
    setImporting(true);
    setError(null);
    
    try {
      await onImport(
        selectedFolders.map((f) => ({
          folderId: f.folderId,
          specialization: f.specialization,
        }))
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      setImporting(false);
    }
  }, [selectedFolders, onImport, onClose]);

  const isSelected = (folderId: string) =>
    selectedFolders.some((f) => f.folderId === folderId);

  const getSelectedFolder = (folderId: string) =>
    selectedFolders.find((f) => f.folderId === folderId);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Outlook-Ordner importieren"
    >
      <div className="flex flex-col gap-4">
        {mailbox && (
          <p className="text-sm text-gray-500">
            Konto: <span className="font-medium text-gray-700">{mailbox}</span>
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        ) : folders.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            Keine Kontaktordner gefunden
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              Wählen Sie die Ordner aus, die Sie importieren möchten. Die Kategorisierung wird automatisch erkannt.
            </p>

            {/* Folder list */}
            <div className="max-h-[300px] space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2">
              {folders.map((folder) => {
                const selected = isSelected(folder.id);
                const selectedData = getSelectedFolder(folder.id);

                return (
                  <div
                    key={folder.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      selected
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleFolder(folder)}
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                          selected
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </button>

                      {/* Folder icon and name */}
                      <Folder className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      <span className="flex-1 truncate text-sm font-medium text-gray-900">
                        {folder.displayName}
                      </span>

                      {/* Auto-detected badge (when not selected) */}
                      {!selected && folder.suggestedSpecialization && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${getSpecializationColor(
                            folder.suggestedSpecialization
                          )}`}
                        >
                          {getSpecializationLabel(folder.suggestedSpecialization)}
                        </span>
                      )}
                    </div>

                    {/* Specialization dropdown (when selected) */}
                    {selected && selectedData && (
                      <div className="mt-3 flex items-center gap-2 pl-8">
                        <span className="text-xs text-gray-500">Kategorie:</span>
                        <div className="relative">
                          <select
                            value={selectedData.specialization || ""}
                            onChange={(e) =>
                              updateSpecialization(
                                folder.id,
                                e.target.value || null
                              )
                            }
                            className="appearance-none rounded-md border border-gray-300 bg-white py-1 pl-2 pr-7 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {SPECIALIZATION_OPTIONS.map((opt) => (
                              <option key={opt.value || "none"} value={opt.value || ""}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Selected count */}
            {selectedFolders.length > 0 && (
              <p className="text-sm text-gray-600">
                {selectedFolders.length} Ordner ausgewählt
              </p>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Abbrechen
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || importing || selectedFolders.length === 0}
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importiere…
              </>
            ) : (
              `${selectedFolders.length} Ordner importieren`
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

