"use client";

import { useRef, useState, useCallback, useEffect, type MouseEvent, type TouchEvent } from "react";
import { cn } from "@/lib/utils/cn";

export type AnnotationTool = "pen" | "highlighter" | "text" | "eraser" | "select";

// Normalized coordinates (0-1 range, percentage of page dimensions)
export interface NormalizedPoint {
  nx: number; // 0-1, percentage of width
  ny: number; // 0-1, percentage of height
}

export interface DrawingAnnotation {
  type: "drawing";
  id: string;
  page: number;
  pointsN: NormalizedPoint[]; // Normalized points
  color: string;
  strokeWidth: number; // Base stroke width (will be scaled)
  isHighlight?: boolean; // If true, render with transparency
}

export interface TextAnnotation {
  type: "text";
  id: string;
  page: number;
  nx: number; // Normalized x
  ny: number; // Normalized y
  text: string;
  fontSize: number; // Base font size (will be scaled)
  color: string;
}

export type Annotation = DrawingAnnotation | TextAnnotation;

// Legacy format for migration
interface LegacyDrawingPath {
  type: "drawing";
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

interface LegacyTextAnnotation {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

type LegacyAnnotation = LegacyDrawingPath | LegacyTextAnnotation;

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Migrate legacy annotations to normalized format
export function migrateAnnotations(
  annotations: (Annotation | LegacyAnnotation)[],
  legacyWidth: number,
  legacyHeight: number,
  currentPage: number
): Annotation[] {
  return annotations.map((ann) => {
    // Already migrated?
    if ("id" in ann && "page" in ann) {
      return ann as Annotation;
    }

    // Migrate legacy drawing
    if (ann.type === "drawing" && "points" in ann) {
      const legacy = ann as LegacyDrawingPath;
      return {
        type: "drawing",
        id: generateId(),
        page: currentPage,
        pointsN: legacy.points.map((p) => ({
          nx: p.x / legacyWidth,
          ny: p.y / legacyHeight,
        })),
        color: legacy.color,
        strokeWidth: legacy.strokeWidth,
        isHighlight: false,
      } as DrawingAnnotation;
    }

    // Migrate legacy text
    if (ann.type === "text" && "x" in ann) {
      const legacy = ann as LegacyTextAnnotation;
      return {
        type: "text",
        id: generateId(),
        page: currentPage,
        nx: legacy.x / legacyWidth,
        ny: legacy.y / legacyHeight,
        text: legacy.text,
        fontSize: legacy.fontSize,
        color: legacy.color,
      } as TextAnnotation;
    }

    return ann as Annotation;
  });
}

interface AnnotationCanvasProps {
  width: number;
  height: number;
  baseWidth: number; // Original PDF page width for scaling
  baseHeight: number; // Original PDF page height for scaling
  currentPage: number;
  annotations: Annotation[];
  onChange: (annotations: Annotation[]) => void;
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  className?: string;
}

export function AnnotationCanvas({
  width,
  height,
  baseWidth,
  baseHeight,
  currentPage,
  annotations,
  onChange,
  tool,
  color,
  strokeWidth,
  fontSize,
  className,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<NormalizedPoint[]>([]);
  const [textInput, setTextInput] = useState<{ nx: number; ny: number; visible: boolean }>({
    nx: 0,
    ny: 0,
    visible: false,
  });
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // Selection/drag state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<NormalizedPoint | null>(null);

  // Scale factor for stroke widths and font sizes
  const scale = width / baseWidth;

  // Filter annotations for current page
  const pageAnnotations = annotations.filter((a) => a.page === currentPage);

  // Convert normalized to pixel coordinates
  const toPixel = useCallback(
    (nx: number, ny: number) => ({
      x: nx * width,
      y: ny * height,
    }),
    [width, height]
  );

  // Convert pixel to normalized coordinates
  const toNormalized = useCallback(
    (x: number, y: number): NormalizedPoint => ({
      nx: x / width,
      ny: y / height,
    }),
    [width, height]
  );

  // Redraw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Draw all annotations for current page
    pageAnnotations.forEach((annotation) => {
      if (annotation.type === "drawing") {
        drawPath(ctx, annotation, annotation.id === selectedId);
      } else if (annotation.type === "text") {
        drawText(ctx, annotation, annotation.id === selectedId);
      }
    });

    // Draw current path being drawn
    if (currentPath.length > 0) {
      const isHighlight = tool === "highlighter";
      drawPath(ctx, {
        type: "drawing",
        id: "current",
        page: currentPage,
        pointsN: currentPath,
        color,
        strokeWidth,
        isHighlight,
      }, false);
    }
  }, [pageAnnotations, currentPath, width, height, color, strokeWidth, tool, selectedId, currentPage]);

  const drawPath = (ctx: CanvasRenderingContext2D, path: DrawingAnnotation, isSelected: boolean) => {
    if (path.pointsN.length < 2) return;

    ctx.save();
    
    if (path.isHighlight) {
      ctx.globalAlpha = 0.35;
    }

    ctx.beginPath();
    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.strokeWidth * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const first = toPixel(path.pointsN[0].nx, path.pointsN[0].ny);
    ctx.moveTo(first.x, first.y);
    
    for (let i = 1; i < path.pointsN.length; i++) {
      const pt = toPixel(path.pointsN[i].nx, path.pointsN[i].ny);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Draw selection outline
    if (isSelected) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  };

  const drawText = (ctx: CanvasRenderingContext2D, text: TextAnnotation, isSelected: boolean) => {
    const scaledFontSize = text.fontSize * scale;
    const pos = toPixel(text.nx, text.ny);
    
    ctx.font = `${scaledFontSize}px sans-serif`;
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, pos.x, pos.y);

    // Draw selection box
    if (isSelected) {
      const metrics = ctx.measureText(text.text);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        pos.x - 2,
        pos.y - scaledFontSize,
        metrics.width + 4,
        scaledFontSize + 4
      );
      ctx.setLineDash([]);
    }
  };

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    []
  );

  // Hit test for selection
  const hitTest = useCallback(
    (x: number, y: number): Annotation | null => {
      const hitRadius = 15;
      const normalized = toNormalized(x, y);

      // Check in reverse order (top-most first)
      for (let i = pageAnnotations.length - 1; i >= 0; i--) {
        const ann = pageAnnotations[i];

        if (ann.type === "drawing") {
          // Check if any point is near the click
          for (const pt of ann.pointsN) {
            const pixelPt = toPixel(pt.nx, pt.ny);
            const dist = Math.sqrt((pixelPt.x - x) ** 2 + (pixelPt.y - y) ** 2);
            if (dist < hitRadius) {
              return ann;
            }
          }
        } else if (ann.type === "text") {
          const pos = toPixel(ann.nx, ann.ny);
          const scaledFontSize = ann.fontSize * scale;
          const textWidth = ann.text.length * scaledFontSize * 0.6;
          
          if (
            x >= pos.x - 5 &&
            x <= pos.x + textWidth + 5 &&
            y >= pos.y - scaledFontSize - 5 &&
            y <= pos.y + 5
          ) {
            return ann;
          }
        }
      }
      return null;
    },
    [pageAnnotations, toPixel, toNormalized, scale]
  );

  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      const coords = getCanvasCoords(clientX, clientY);
      const normalized = toNormalized(coords.x, coords.y);

      if (tool === "select") {
        const hit = hitTest(coords.x, coords.y);
        if (hit) {
          setSelectedId(hit.id);
          setIsDragging(true);
          setDragStart(normalized);
        } else {
          setSelectedId(null);
        }
      } else if (tool === "text") {
        setTextInput({ nx: normalized.nx, ny: normalized.ny, visible: true });
        setTextValue("");
        setTimeout(() => textInputRef.current?.focus(), 0);
      } else if (tool === "pen" || tool === "highlighter") {
        setIsDrawing(true);
        setCurrentPath([normalized]);
        setSelectedId(null);
      } else if (tool === "eraser") {
        const hit = hitTest(coords.x, coords.y);
        if (hit) {
          onChange(annotations.filter((a) => a.id !== hit.id));
        }
        setSelectedId(null);
      }
    },
    [tool, getCanvasCoords, toNormalized, hitTest, annotations, onChange]
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      const coords = getCanvasCoords(clientX, clientY);
      const normalized = toNormalized(coords.x, coords.y);

      if (isDrawing && (tool === "pen" || tool === "highlighter")) {
        setCurrentPath((prev) => [...prev, normalized]);
      } else if (isDragging && selectedId && dragStart) {
        // Calculate delta in normalized space
        const dnx = normalized.nx - dragStart.nx;
        const dny = normalized.ny - dragStart.ny;

        // Update the selected annotation's position
        const newAnnotations = annotations.map((ann) => {
          if (ann.id !== selectedId) return ann;

          if (ann.type === "drawing") {
            return {
              ...ann,
              pointsN: ann.pointsN.map((pt) => ({
                nx: pt.nx + dnx,
                ny: pt.ny + dny,
              })),
            };
          } else if (ann.type === "text") {
            return {
              ...ann,
              nx: ann.nx + dnx,
              ny: ann.ny + dny,
            };
          }
          return ann;
        });

        onChange(newAnnotations);
        setDragStart(normalized);
      }
    },
    [isDrawing, isDragging, selectedId, dragStart, tool, getCanvasCoords, toNormalized, annotations, onChange]
  );

  const handlePointerUp = useCallback(() => {
    if (isDrawing && currentPath.length > 1) {
      const isHighlight = tool === "highlighter";
      const newPath: DrawingAnnotation = {
        type: "drawing",
        id: generateId(),
        page: currentPage,
        pointsN: currentPath,
        color,
        strokeWidth: isHighlight ? Math.max(strokeWidth, 12) : strokeWidth,
        isHighlight,
      };
      onChange([...annotations, newPath]);
    }
    setIsDrawing(false);
    setCurrentPath([]);
    setIsDragging(false);
    setDragStart(null);
  }, [isDrawing, currentPath, color, strokeWidth, tool, currentPage, annotations, onChange]);

  const handleTextSubmit = useCallback(() => {
    if (textValue.trim()) {
      const newText: TextAnnotation = {
        type: "text",
        id: generateId(),
        page: currentPage,
        nx: textInput.nx,
        ny: textInput.ny,
        text: textValue.trim(),
        fontSize,
        color,
      };
      onChange([...annotations, newText]);
    }
    setTextInput({ nx: 0, ny: 0, visible: false });
    setTextValue("");
  }, [textValue, textInput, fontSize, color, currentPage, annotations, onChange]);

  // Mouse events
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    handlePointerDown(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    handlePointerMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handlePointerUp();
  };

  // Touch events
  const handleTouchStart = (e: TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    handlePointerDown(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    handlePointerMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    handlePointerUp();
  };

  // Pixel position for text input
  const textInputPixel = toPixel(textInput.nx, textInput.ny);
  const scaledFontSize = fontSize * scale;

  return (
    <div className={cn("relative", className)} style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={cn(
          "absolute inset-0 touch-none",
          tool === "pen" && "cursor-crosshair",
          tool === "highlighter" && "cursor-crosshair",
          tool === "text" && "cursor-text",
          tool === "eraser" && "cursor-pointer",
          tool === "select" && "cursor-move"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Text input overlay */}
      {textInput.visible && (
        <input
          ref={textInputRef}
          type="text"
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={handleTextSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleTextSubmit();
            } else if (e.key === "Escape") {
              setTextInput({ nx: 0, ny: 0, visible: false });
              setTextValue("");
            }
          }}
          className="absolute border border-blue-500 bg-white px-1 text-sm outline-none"
          style={{
            left: textInputPixel.x,
            top: textInputPixel.y - scaledFontSize,
            fontSize: scaledFontSize,
            color,
          }}
          placeholder="Type here..."
        />
      )}
    </div>
  );
}
