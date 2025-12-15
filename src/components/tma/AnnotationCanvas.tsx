"use client";

import { useRef, useState, useCallback, useEffect, type MouseEvent, type TouchEvent } from "react";
import { cn } from "@/lib/utils/cn";

export type AnnotationTool = "pen" | "text" | "eraser";

export interface DrawingPath {
  type: "drawing";
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

export interface TextAnnotation {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

export type Annotation = DrawingPath | TextAnnotation;

interface AnnotationCanvasProps {
  width: number;
  height: number;
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
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // Redraw canvas when annotations change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw all annotations
    annotations.forEach((annotation) => {
      if (annotation.type === "drawing") {
        drawPath(ctx, annotation);
      } else if (annotation.type === "text") {
        drawText(ctx, annotation);
      }
    });

    // Draw current path being drawn
    if (currentPath.length > 0) {
      drawPath(ctx, {
        type: "drawing",
        points: currentPath,
        color,
        strokeWidth,
      });
    }
  }, [annotations, currentPath, width, height, color, strokeWidth]);

  const drawPath = (ctx: CanvasRenderingContext2D, path: DrawingPath) => {
    if (path.points.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = path.color;
    ctx.lineWidth = path.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.stroke();
  };

  const drawText = (ctx: CanvasRenderingContext2D, text: TextAnnotation) => {
    ctx.font = `${text.fontSize}px sans-serif`;
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
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

  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      const coords = getCanvasCoords(clientX, clientY);

      if (tool === "text") {
        setTextInput({ x: coords.x, y: coords.y, visible: true });
        setTextValue("");
        setTimeout(() => textInputRef.current?.focus(), 0);
      } else if (tool === "pen") {
        setIsDrawing(true);
        setCurrentPath([coords]);
      } else if (tool === "eraser") {
        // Find and remove annotation at this point
        const hitRadius = 10;
        const newAnnotations = annotations.filter((annotation) => {
          if (annotation.type === "drawing") {
            // Check if any point is within hit radius
            return !annotation.points.some(
              (p) => Math.abs(p.x - coords.x) < hitRadius && Math.abs(p.y - coords.y) < hitRadius
            );
          } else if (annotation.type === "text") {
            // Simple bounding box check for text
            const textWidth = annotation.text.length * annotation.fontSize * 0.6;
            return !(
              coords.x >= annotation.x &&
              coords.x <= annotation.x + textWidth &&
              coords.y >= annotation.y - annotation.fontSize &&
              coords.y <= annotation.y
            );
          }
          return true;
        });
        if (newAnnotations.length !== annotations.length) {
          onChange(newAnnotations);
        }
      }
    },
    [tool, getCanvasCoords, annotations, onChange]
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDrawing || tool !== "pen") return;

      const coords = getCanvasCoords(clientX, clientY);
      setCurrentPath((prev) => [...prev, coords]);
    },
    [isDrawing, tool, getCanvasCoords]
  );

  const handlePointerUp = useCallback(() => {
    if (isDrawing && currentPath.length > 1) {
      const newPath: DrawingPath = {
        type: "drawing",
        points: currentPath,
        color,
        strokeWidth,
      };
      onChange([...annotations, newPath]);
    }
    setIsDrawing(false);
    setCurrentPath([]);
  }, [isDrawing, currentPath, color, strokeWidth, annotations, onChange]);

  const handleTextSubmit = useCallback(() => {
    if (textValue.trim()) {
      const newText: TextAnnotation = {
        type: "text",
        x: textInput.x,
        y: textInput.y,
        text: textValue.trim(),
        fontSize,
        color,
      };
      onChange([...annotations, newText]);
    }
    setTextInput({ x: 0, y: 0, visible: false });
    setTextValue("");
  }, [textValue, textInput, fontSize, color, annotations, onChange]);

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

  return (
    <div className={cn("relative", className)} style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={cn(
          "absolute inset-0 touch-none",
          tool === "pen" && "cursor-crosshair",
          tool === "text" && "cursor-text",
          tool === "eraser" && "cursor-pointer"
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
              setTextInput({ x: 0, y: 0, visible: false });
              setTextValue("");
            }
          }}
          className="absolute border border-blue-500 bg-white px-1 text-sm outline-none"
          style={{
            left: textInput.x,
            top: textInput.y - fontSize,
            fontSize,
            color,
          }}
          placeholder="Type here..."
        />
      )}
    </div>
  );
}
