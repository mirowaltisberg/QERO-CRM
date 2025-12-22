"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Loader2, Cloud } from "lucide-react";
import { deriveSpecializationFromFolderName, getSpecializationLabel } from "@/lib/utils/outlook-specialization";

interface OutlookFolder {
  id: string;
  displayName: string;
  specialization: string | null;
}

interface SelectedFolder {
  folderId: string;
  specialization: string | null;
}

interface TmaOutlookSyncButtonProps {
  onSyncComplete?: () => void;
}

export function TmaOutlookSyncButton({ onSyncComplete }: TmaOutlookSyncButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [folders, setFolders] = useState<OutlookFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<Map<string, SelectedFolder>>(new Map());
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const fetchFolders = useCallback(async () => {
    setLoadingFolders(true);
    setError(null);
    setSelectedFolders(new Map());
    setResult(null);

    try {
      const response = await fetch("/api/contacts/outlook/folders");
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to fetch folders");
      }

      // Add derived specialization to each folder
      const foldersWithSpec = json.data.folders.map((folder: { id: string; displayName: string }) => ({
        ...folder,
        specialization: deriveSpecializationFromFolderName(folder.displayName),
      }));

      setFolders(foldersWithSpec);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch folders");
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    fetchFolders();
  }, [fetchFolders]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setFolders([]);
    setSelectedFolders(new Map());
    setError(null);
    setResult(null);
  }, []);

  const handleFolderToggle = useCallback((folder: OutlookFolder) => {
    setSelectedFolders(prev => {
      const newMap = new Map(prev);
      if (newMap.has(folder.id)) {
        newMap.delete(folder.id);
      } else {
        newMap.set(folder.id, { folderId: folder.id, specialization: folder.specialization });
      }
      return newMap;
    });
  }, []);

  const handleSpecializationChange = useCallback((folderId: string, specialization: string) => {
    setSelectedFolders(prev => {
      const newMap = new Map(prev);
      const folder = newMap.get(folderId);
      if (folder) {
        newMap.set(folderId, { ...folder, specialization: specialization === "" ? null : specialization });
      }
      return newMap;
    });
  }, []);

  const handleSync = useCallback(async () => {
    if (selectedFolders.size === 0) return;

    setSyncing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/tma/outlook/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders: Array.from(selectedFolders.values()) }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Sync failed");
      }

      setResult({
        imported: json.data.imported,
        skipped: json.data.skipped,
      });

      onSyncComplete?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [selectedFolders, onSyncComplete, router]);

  const hasSelectedFolders = selectedFolders.size > 0;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleOpen}
        className="gap-2 w-full"
      >
        <Cloud className="h-4 w-4" />
        Outlook Import
      </Button>

      <Modal
        open={isOpen}
        onClose={handleClose}
        title="TMA aus Outlook importieren"
        description="Wählen Sie Outlook-Ordner aus, um Kandidaten zu importieren"
      >
        {loadingFolders ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            <p className="mt-4 text-sm text-gray-500">Ordner werden geladen...</p>
          </div>
        ) : error && !result ? (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4 text-center">
              <p className="text-lg font-semibold text-green-700">
                {result.imported} Kandidaten importiert
              </p>
              {result.skipped > 0 && (
                <p className="mt-1 text-sm text-green-600">
                  {result.skipped} übersprungen (bereits vorhanden)
                </p>
              )}
            </div>
            <Button onClick={handleClose} className="w-full">
              Schliessen
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {folders.length === 0 ? (
              <p className="text-sm text-gray-500">Keine Ordner gefunden</p>
            ) : (
              <div className="max-h-80 overflow-y-auto pr-2 space-y-1">
                {folders.map(folder => {
                  const isSelected = selectedFolders.has(folder.id);
                  const currentSpec = selectedFolders.get(folder.id)?.specialization;
                  
                  return (
                    <div 
                      key={folder.id} 
                      className={`
                        flex items-center justify-between p-3 rounded-lg border cursor-pointer transition
                        ${isSelected 
                          ? "border-blue-300 bg-blue-50" 
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        }
                      `}
                      onClick={() => handleFolderToggle(folder)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`
                          w-5 h-5 rounded border-2 flex items-center justify-center
                          ${isSelected ? "border-blue-500 bg-blue-500" : "border-gray-300"}
                        `}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          {folder.displayName}
                        </span>
                      </div>
                      
                      {isSelected && (
                        <select
                          value={currentSpec || ""}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSpecializationChange(folder.id, e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs px-2 py-1 rounded border border-gray-200 bg-white"
                          disabled={syncing}
                        >
                          <option value="">Keine</option>
                          <option value="holzbau">{getSpecializationLabel("holzbau")}</option>
                          <option value="dachdecker">{getSpecializationLabel("dachdecker")}</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              onClick={handleSync}
              className="w-full"
              disabled={syncing || !hasSelectedFolders}
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importiere...
                </>
              ) : (
                `${selectedFolders.size} Ordner importieren`
              )}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
