"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface TableStats {
  scanned: number;
  withIssues: number;
  fixed: number;
  errors: string[];
  examples: Array<{ id: string; field: string; before: string; after: string }>;
}

interface EncodingPreviewData {
  preview: boolean;
  success: boolean;
  tables: Record<string, TableStats>;
  totalFixed: number;
  totalScanned: number;
}

interface DedupePreviewData {
  preview: boolean;
  success: boolean;
  duplicateGroups: number;
  contactsToDelete: number;
  examples: Array<{
    primaryName: string;
    duplicateNames: string[];
    matchReason: string;
  }>;
}

type CleanupType = "encoding" | "dedupe";

interface CleanupModalProps {
  type: CleanupType;
  onClose: () => void;
  onComplete: () => void;
}

export function CleanupModal({ type, onClose, onComplete }: CleanupModalProps) {
  const [stage, setStage] = useState<"loading" | "preview" | "applying" | "done" | "error">("loading");
  const [previewData, setPreviewData] = useState<EncodingPreviewData | DedupePreviewData | null>(null);
  const [result, setResult] = useState<EncodingPreviewData | DedupePreviewData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Fetch preview on mount
  useEffect(() => {
    fetchPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchPreview() {
    setStage("loading");
    try {
      // Both endpoints use GET for preview
      const endpoint = type === "encoding" 
        ? "/api/contacts/fix-encoding" 
        : "/api/contacts/dedupe";
      
      const res = await fetch(endpoint);
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to fetch preview");
        setStage("error");
        return;
      }

      setPreviewData(data);
      setStage("preview");
    } catch (err) {
      setErrorMessage("Network error. Please try again.");
      setStage("error");
      console.error(err);
    }
  }

  async function applyChanges() {
    setStage("applying");
    try {
      // Both endpoints use POST for apply
      const endpoint = type === "encoding"
        ? "/api/contacts/fix-encoding"
        : "/api/contacts/dedupe";

      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to apply changes");
        setStage("error");
        return;
      }

      setResult(data);
      setStage("done");
    } catch (err) {
      setErrorMessage("Network error. Please try again.");
      setStage("error");
      console.error(err);
    }
  }

  function handleDone() {
    onComplete();
    onClose();
  }

  const title = type === "encoding" ? "Fix Broken Characters" : "Merge Duplicate Companies";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold">{title}</h2>

        {stage === "loading" && (
          <div className="py-8 text-center text-gray-500">
            <div className="mb-2 text-2xl">⏳</div>
            Scanning for issues...
          </div>
        )}

        {stage === "error" && (
          <div className="py-8 text-center">
            <div className="mb-2 text-2xl">❌</div>
            <p className="text-red-600">{errorMessage}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={onClose}>Close</Button>
              <Button variant="primary" onClick={fetchPreview}>Retry</Button>
            </div>
          </div>
        )}

        {stage === "preview" && previewData && type === "encoding" && (
          <EncodingPreview 
            data={previewData as EncodingPreviewData} 
            onApply={applyChanges} 
            onCancel={onClose} 
          />
        )}

        {stage === "preview" && previewData && type === "dedupe" && (
          <DedupePreview 
            data={previewData as DedupePreviewData} 
            onApply={applyChanges} 
            onCancel={onClose} 
          />
        )}

        {stage === "applying" && (
          <div className="py-8 text-center text-gray-500">
            <div className="mb-2 text-2xl">⚙️</div>
            Applying changes...
          </div>
        )}

        {stage === "done" && result && (
          <ResultView 
            type={type} 
            data={result} 
            onDone={handleDone} 
          />
        )}
      </div>
    </div>
  );
}

function EncodingPreview({ 
  data, 
  onApply, 
  onCancel 
}: { 
  data: EncodingPreviewData; 
  onApply: () => void; 
  onCancel: () => void;
}) {
  const totalIssues = Object.values(data.tables).reduce((sum, t) => sum + t.withIssues, 0);

  if (totalIssues === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-2xl">✅</div>
        <p className="text-gray-600">No encoding issues found! Your data is clean.</p>
        <div className="mt-4">
          <Button variant="primary" onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 rounded-lg bg-amber-50 p-4 text-amber-800">
        <strong>Found {totalIssues} records</strong> with broken characters across {Object.keys(data.tables).length} tables.
      </div>

      <div className="space-y-4">
        {Object.entries(data.tables).map(([tableName, stats]) => (
          stats.withIssues > 0 && (
            <div key={tableName} className="rounded-lg border p-4">
              <h4 className="font-medium capitalize">{tableName.replace(/_/g, " ")}</h4>
              <p className="text-sm text-gray-500">
                {stats.withIssues} of {stats.scanned} records need fixing
              </p>
              {stats.examples.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-medium text-gray-400">Examples:</p>
                  {stats.examples.slice(0, 3).map((ex, i) => (
                    <div key={i} className="text-sm">
                      <span className="text-red-500 line-through">{ex.before}</span>
                      {" → "}
                      <span className="text-green-600">{ex.after}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ))}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onApply}>
          Fix {totalIssues} Records
        </Button>
      </div>
    </div>
  );
}

function DedupePreview({ 
  data, 
  onApply, 
  onCancel 
}: { 
  data: DedupePreviewData; 
  onApply: () => void; 
  onCancel: () => void;
}) {
  if (data.duplicateGroups === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-2xl">✅</div>
        <p className="text-gray-600">No duplicate companies found!</p>
        <div className="mt-4">
          <Button variant="primary" onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 rounded-lg bg-amber-50 p-4 text-amber-800">
        <strong>Found {data.duplicateGroups} duplicate groups</strong>
        <br />
        <span className="text-sm">
          {data.contactsToDelete} companies will be merged and archived.
        </span>
      </div>

      {data.examples && data.examples.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-500">Example duplicates:</p>
          {data.examples.slice(0, 5).map((ex, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="font-medium">{ex.primaryName}</div>
              <div className="text-sm text-gray-500">
                Merging: {ex.duplicateNames.join(", ")}
              </div>
              <div className="text-xs text-gray-400">
                Match: {ex.matchReason}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
        <strong>Note:</strong> All deleted companies will be archived and can be restored later.
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onApply}>
          Merge & Archive {data.contactsToDelete} Duplicates
        </Button>
      </div>
    </div>
  );
}

function ResultView({ 
  type, 
  data, 
  onDone 
}: { 
  type: CleanupType;
  data: EncodingPreviewData | DedupePreviewData; 
  onDone: () => void;
}) {
  if (type === "encoding") {
    const encodingData = data as EncodingPreviewData;
    return (
      <div className="py-4 text-center">
        <div className="mb-2 text-4xl">✅</div>
        <h3 className="text-lg font-semibold">Encoding Fixed!</h3>
        <p className="mt-2 text-gray-600">
          Fixed {encodingData.totalFixed} records across {Object.keys(encodingData.tables).length} tables.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  }

  const dedupeData = data as DedupePreviewData;
  return (
    <div className="py-4 text-center">
      <div className="mb-2 text-4xl">✅</div>
      <h3 className="text-lg font-semibold">Duplicates Merged!</h3>
      <p className="mt-2 text-gray-600">
        Merged {dedupeData.duplicateGroups} groups, archived {dedupeData.contactsToDelete} companies.
      </p>
      <div className="mt-4">
        <Button variant="primary" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
