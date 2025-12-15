"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AnnotationCanvas, migrateAnnotations, type Annotation, type AnnotationTool } from "./AnnotationCanvas";
import { cn } from "@/lib/utils/cn";

// Configure PDF.js worker from CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#000000"];
const STROKE_WIDTHS = [2, 4, 6, 8];
const HIGHLIGHTER_WIDTHS = [8, 12, 16, 20];
const FONT_SIZES = [14, 18, 24, 32];

type ViewSize = "normal" | "large" | "fullscreen";

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
  
  // Original PDF page dimensions (intrinsic size)
  const [pdfWidth, setPdfWidth] = useState(0);
  const [pdfHeight, setPdfHeight] = useState(0);
  
  // Rendered dimensions (scaled to fit viewport)
  const [renderWidth, setRenderWidth] = useState(600);
  const [renderHeight, setRenderHeight] = useState(800);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View size state
  const [viewSize, setViewSize] = useState<ViewSize>("normal");

  // Annotation state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [highlighterWidth, setHighlighterWidth] = useState(12);
  const [fontSize, setFontSize] = useState(18);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [annotationsMigrated, setAnnotationsMigrated] = useState(false);
  
  // Auto-save refs
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const annotationsRef = useRef<Annotation[]>(annotations);
  
  // Container ref for measuring available space
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Keep ref in sync
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // Load annotations on open
  useEffect(() => {
    if (open && candidateId) {
      loadAnnotations();
      setAnnotationsMigrated(false);
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

  // Migrate legacy annotations when PDF dimensions are known
  useEffect(() => {
    if (pdfWidth > 0 && pdfHeight > 0 && annotations.length > 0 && !annotationsMigrated) {
      // Check if migration is needed (any annotation without 'id' or 'page')
      const needsMigration = annotations.some((a) => !("id" in a) || !("page" in a));
      if (needsMigration) {
        const migrated = migrateAnnotations(annotations, pdfWidth, pdfHeight, pageNumber);
        setAnnotations(migrated);
        // Trigger save after migration
        setTimeout(() => performSave(migrated), 500);
      }
      setAnnotationsMigrated(true);
    }
  }, [pdfWidth, pdfHeight, annotations, annotationsMigrated, pageNumber]);

  // Perform save
  const performSave = useCallback(async (annotationsToSave: Annotation[]) => {
    setSaving(true);
    try {
      await fetch(`/api/tma/${candidateId}/annotations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_type: "short_profile",
          annotations: annotationsToSave,
        }),
      });
      setLastSaved(new Date());
    } catch (err) {
      console.error("Failed to save annotations:", err);
    } finally {
      setSaving(false);
    }
  }, [candidateId]);

  // Auto-save after each edit (debounced 1 second)
  const triggerAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      performSave(annotationsRef.current);
    }, 1000);
  }, [performSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save immediately on close
  const handleClose = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      await performSave(annotationsRef.current);
    }
    onClose();
  }, [performSave, onClose]);

  const handleAnnotationsChange = useCallback((newAnnotations: Annotation[]) => {
    setAnnotations(newAnnotations);
    triggerAutoSave();
  }, [triggerAutoSave]);

  // Calculate viewport dimensions based on view size
  const getViewportDimensions = useCallback(() => {
    if (typeof window === "undefined") {
      return { maxWidth: 700, maxHeight: 600 };
    }
    
    switch (viewSize) {
      case "fullscreen":
        return {
          maxWidth: window.innerWidth - 100,
          maxHeight: window.innerHeight - 200, // Account for header/footer
        };
      case "large":
        return {
          maxWidth: 1000,
          maxHeight: window.innerHeight - 280,
        };
      default:
        return {
          maxWidth: 700,
          maxHeight: 600,
        };
    }
  }, [viewSize]);

  // Recalculate render dimensions when view size or PDF dimensions change
  const calculateRenderSize = useCallback(() => {
    if (pdfWidth === 0 || pdfHeight === 0) return;
    
    const { maxWidth, maxHeight } = getViewportDimensions();
    
    // Fit-to-page: scale to fit both width AND height
    const scaleW = maxWidth / pdfWidth;
    const scaleH = maxHeight / pdfHeight;
    const scale = Math.min(scaleW, scaleH, 2); // Cap at 2x zoom
    
    setRenderWidth(Math.round(pdfWidth * scale));
    setRenderHeight(Math.round(pdfHeight * scale));
  }, [pdfWidth, pdfHeight, getViewportDimensions]);

  // Recalculate when view size changes
  useEffect(() => {
    calculateRenderSize();
  }, [viewSize, calculateRenderSize]);

  const handleClearAll = useCallback(() => {
    if (confirm("Alle Notizen löschen?")) {
      setAnnotations([]);
      triggerAutoSave();
    }
  }, [triggerAutoSave]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (err: Error) => {
    setError(err.message);
    setLoading(false);
  };

  const onPageLoadSuccess = useCallback(({ width, height }: { width: number; height: number }) => {
    // Store original PDF dimensions
    setPdfWidth(width);
    setPdfHeight(height);
    
    // Calculate initial render size
    const { maxWidth, maxHeight } = getViewportDimensions();
    const scaleW = maxWidth / width;
    const scaleH = maxHeight / height;
    const scale = Math.min(scaleW, scaleH, 2);
    
    setRenderWidth(Math.round(width * scale));
    setRenderHeight(Math.round(height * scale));
  }, [getViewportDimensions]);

  // Determine modal size
  const modalSize = viewSize === "fullscreen" ? "full" : viewSize === "large" ? "xl" : "lg";
  const heightClass = viewSize === "fullscreen" ? "h-[95vh]" : viewSize === "large" ? "h-[90vh]" : "h-[85vh]";

  // Current stroke width based on tool
  const currentStrokeWidth = tool === "highlighter" ? highlighterWidth : strokeWidth;

  return (
    <Modal open={open} onClose={handleClose} size={modalSize}>
      <div className={cn("flex flex-col", heightClass)}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Kurzprofil Vorschau</h2>
            <p className="text-sm text-gray-500">{candidateName}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Size toggle */}
            <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
              <button
                onClick={() => setViewSize("normal")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  viewSize === "normal" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                )}
                title="Normal"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              </button>
              <button
                onClick={() => setViewSize("large")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  viewSize === "large" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                )}
                title="Gross"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              </button>
              <button
                onClick={() => setViewSize("fullscreen")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  viewSize === "fullscreen" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                )}
                title="Vollbild (ganze Seite)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5" />
                </svg>
              </button>
            </div>

            {/* Auto-save status */}
            <div className="flex items-center gap-1.5 text-xs">
              {saving ? (
                <span className="text-blue-600 flex items-center gap-1">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Speichern...
                </span>
              ) : lastSaved ? (
                <span className="text-green-600 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Gespeichert
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 pb-3 mb-3">
          {/* Tools */}
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            {/* Select/Move tool */}
            <button
              onClick={() => setTool("select")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tool === "select" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
              )}
              title="Auswählen & Verschieben"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
              </svg>
            </button>
            {/* Pen tool */}
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
            {/* Highlighter tool */}
            <button
              onClick={() => setTool("highlighter")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tool === "highlighter" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
              )}
              title="Textmarker"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
              </svg>
            </button>
            {/* Text tool */}
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
            {/* Eraser tool */}
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

          {/* Highlighter width */}
          {tool === "highlighter" && (
            <select
              value={highlighterWidth}
              onChange={(e) => setHighlighterWidth(Number(e.target.value))}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
            >
              {HIGHLIGHTER_WIDTHS.map((w) => (
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
        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 rounded-lg flex items-center justify-center">
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

          <div className="p-4">
            <div className="relative" style={{ width: renderWidth, height: renderHeight }}>
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={null}
              >
                <Page
                  pageNumber={pageNumber}
                  width={renderWidth}
                  onLoadSuccess={onPageLoadSuccess}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>

              {/* Annotation overlay */}
              {!loading && !error && pdfWidth > 0 && (
                <div className="absolute inset-0">
                  <AnnotationCanvas
                    width={renderWidth}
                    height={renderHeight}
                    baseWidth={pdfWidth}
                    baseHeight={pdfHeight}
                    currentPage={pageNumber}
                    annotations={annotations}
                    onChange={handleAnnotationsChange}
                    tool={tool}
                    color={color}
                    strokeWidth={currentStrokeWidth}
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
