"use client";

import { useState, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AnnotationCanvas, type Annotation, type AnnotationTool } from "./AnnotationCanvas";
import { cn } from "@/lib/utils/cn";

// Configure PDF.js worker from CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#000000"];
const STROKE_WIDTHS = [2, 4, 6, 8];
const FONT_SIZES = [14, 18, 24, 32];

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  pdfUrl: string;
  candidateId: string;
  candidateName: string;
}

export function PdfPreviewModal({
  open,
  onClose,
  pdfUrl,
  candidateId,
  candidateName,
}: PdfPreviewModalProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageWidth, setPageWidth] = useState(600);
  const [pageHeight, setPageHeight] = useState(800);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Annotation state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fontSize, setFontSize] = useState(18);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load annotations on open
  useEffect(() => {
    if (open && candidateId) {
      loadAnnotations();
    }
  }, [open, candidateId]);

  const loadAnnotations = async () => {
    try {
      const response = await fetch(`/api/tma/${candidateId}/annotations?type=short_profile`);
      if (response.ok) {
        const data = await response.json();
        setAnnotations(data.annotations || []);
      }
    } catch (err) {
      console.error("Failed to load annotations:", err);
    }
  };

  const saveAnnotations = useCallback(async () => {
    if (!hasChanges) return;
    
    setSaving(true);
    try {
      await fetch(`/api/tma/${candidateId}/annotations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_type: "short_profile",
          annotations,
        }),
      });
      setHasChanges(false);
    } catch (err) {
      console.error("Failed to save annotations:", err);
    } finally {
      setSaving(false);
    }
  }, [candidateId, annotations, hasChanges]);

  // Auto-save on close
  const handleClose = useCallback(async () => {
    if (hasChanges) {
      await saveAnnotations();
    }
    onClose();
  }, [hasChanges, saveAnnotations, onClose]);

  const handleAnnotationsChange = useCallback((newAnnotations: Annotation[]) => {
    setAnnotations(newAnnotations);
    setHasChanges(true);
  }, []);

  const handleClearAll = useCallback(() => {
    if (confirm("Alle Notizen löschen?")) {
      setAnnotations([]);
      setHasChanges(true);
    }
  }, []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (err: Error) => {
    setError(err.message);
    setLoading(false);
  };

  const onPageLoadSuccess = ({ width, height }: { width: number; height: number }) => {
    // Scale to fit modal width (max ~700px)
    const scale = Math.min(700 / width, 1);
    setPageWidth(width * scale);
    setPageHeight(height * scale);
  };

  return (
    <Modal open={open} onClose={handleClose} size="lg">
      <div className="flex flex-col h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Kurzprofil Vorschau</h2>
            <p className="text-sm text-gray-500">{candidateName}</p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-xs text-orange-600">Ungespeichert</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={saveAnnotations}
              disabled={!hasChanges || saving}
            >
              {saving ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 pb-3 mb-3">
          {/* Tools */}
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setTool("pen")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tool === "pen" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
              )}
              title="Zeichnen"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
              </svg>
            </button>
            <button
              onClick={() => setTool("text")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tool === "text" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
              )}
              title="Text"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            </button>
            <button
              onClick={() => setTool("eraser")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tool === "eraser" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
              )}
              title="Radierer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
              </svg>
            </button>
          </div>

          {/* Colors */}
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-transform",
                  color === c ? "scale-110 border-gray-900" : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Stroke width (for pen) */}
          {tool === "pen" && (
            <select
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
            >
              {STROKE_WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
          )}

          {/* Font size (for text) */}
          {tool === "text" && (
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
          )}

          {/* Clear all */}
          <button
            onClick={handleClearAll}
            className="ml-auto text-xs text-red-600 hover:text-red-700"
          >
            Alles löschen
          </button>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 overflow-auto bg-gray-100 rounded-lg">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-gray-500">PDF wird geladen...</div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-red-500">Fehler: {error}</div>
            </div>
          )}

          <div className="flex justify-center p-4">
            <div className="relative" style={{ width: pageWidth, height: pageHeight }}>
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={null}
              >
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  onLoadSuccess={onPageLoadSuccess}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>

              {/* Annotation overlay */}
              {!loading && !error && (
                <div className="absolute inset-0">
                  <AnnotationCanvas
                    width={pageWidth}
                    height={pageHeight}
                    annotations={annotations}
                    onChange={handleAnnotationsChange}
                    tool={tool}
                    color={color}
                    strokeWidth={strokeWidth}
                    fontSize={fontSize}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page navigation */}
        {numPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-3 border-t border-gray-200 mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
            >
              ← Zurück
            </Button>
            <span className="text-sm text-gray-600">
              Seite {pageNumber} von {numPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
            >
              Weiter →
            </Button>
          </div>
        )}

        {/* Note about annotations */}
        <p className="text-xs text-gray-400 text-center mt-2">
          Notizen sind nur für die Vorschau – sie werden nicht mit E-Mails gesendet.
        </p>
      </div>
    </Modal>
  );
}
