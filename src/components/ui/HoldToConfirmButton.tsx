"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils/cn";

interface HoldToConfirmButtonProps {
  onConfirm: () => void;
  holdDuration?: number;
  label?: string;
  confirmLabel?: string;
  successLabel?: string;
  className?: string;
  variant?: "danger" | "warning" | "default";
  size?: "xs" | "sm" | "md" | "lg";
  disabled?: boolean;
}

export function HoldToConfirmButton({
  onConfirm,
  holdDuration = 1500,
  label = "Freigeben",
  confirmLabel = "Sicher?",
  successLabel = "Freigegeben",
  className,
  variant = "danger",
  size = "md",
  disabled = false,
}: HoldToConfirmButtonProps) {
  const [state, setState] = useState<"idle" | "holding" | "confirming" | "success">("idle");
  const [progress, setProgress] = useState(0);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startHolding = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || state !== "idle") return;
    e.preventDefault();
    
    setState("holding");
    setProgress(0);
    startTimeRef.current = Date.now();

    // Progress animation (~60fps)
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / holdDuration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(progressIntervalRef.current!);
      }
    }, 16);

    // Confirm after hold duration
    holdTimerRef.current = setTimeout(() => {
      confirmAction();
    }, holdDuration);
  }, [disabled, state, holdDuration]);

  const cancelHolding = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    if (state !== "holding") return;

    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    setProgress(0);
    setState("idle");
  }, [state]);

  const confirmAction = useCallback(() => {
    setState("confirming");
    setProgress(100);

    // Haptic feedback
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(50);
    }

    onConfirm();

    setTimeout(() => {
      setState("success");
      setTimeout(() => {
        setState("idle");
        setProgress(0);
      }, 2000);
    }, 400);
  }, [onConfirm]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const getLabel = () => {
    switch (state) {
      case "holding":
        return confirmLabel;
      case "confirming":
        return "...";
      case "success":
        return successLabel;
      default:
        return label;
    }
  };

  const sizeClasses = {
    xs: "h-6 px-2 text-[10px] min-w-[70px]",
    sm: "h-7 px-2.5 text-[11px] min-w-[80px]",
    md: "h-8 px-3 text-xs min-w-[100px]",
    lg: "h-10 px-4 text-sm min-w-[120px]",
  };

  const variantClasses = {
    danger: {
      idle: "bg-white text-red-600 border border-red-200 hover:border-red-300 hover:bg-red-50",
      holding: "bg-red-50 text-red-700 border border-red-300",
      confirming: "bg-red-100 text-red-700 border border-red-300",
      success: "bg-green-500 text-white border border-green-500",
    },
    warning: {
      idle: "bg-white text-yellow-600 border border-yellow-200 hover:border-yellow-300 hover:bg-yellow-50",
      holding: "bg-yellow-50 text-yellow-700 border border-yellow-300",
      confirming: "bg-yellow-100 text-yellow-700 border border-yellow-300",
      success: "bg-green-500 text-white border border-green-500",
    },
    default: {
      idle: "bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50",
      holding: "bg-gray-50 text-gray-700 border border-gray-300",
      confirming: "bg-gray-100 text-gray-700 border border-gray-300",
      success: "bg-green-500 text-white border border-green-500",
    },
  };

  const progressColor = {
    danger: "stroke-red-500",
    warning: "stroke-yellow-500",
    default: "stroke-gray-500",
  };

  return (
    <button
      type="button"
      onMouseDown={startHolding}
      onMouseUp={cancelHolding}
      onMouseLeave={cancelHolding}
      onTouchStart={startHolding}
      onTouchEnd={cancelHolding}
      onTouchCancel={cancelHolding}
      disabled={disabled || state === "confirming"}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 select-none touch-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        sizeClasses[size],
        variantClasses[variant][state],
        state === "holding" && "scale-[0.98] cursor-grabbing",
        state === "success" && "animate-[success-shake_0.4s_ease-out]",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {/* Progress ring */}
      {state === "holding" && (
        <svg
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2",
            size === "xs" || size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
          )}
          viewBox="0 0 36 36"
        >
          {/* Background ring */}
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="opacity-20"
          />
          {/* Progress ring */}
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className={progressColor[variant]}
            style={{
              strokeDasharray: `${progress}, 100`,
              transform: "rotate(-90deg)",
              transformOrigin: "center",
              transition: "stroke-dasharray 0.05s linear",
            }}
          />
        </svg>
      )}

      {/* Success checkmark with confetti-like burst */}
      {state === "success" && (
        <span className="relative flex items-center justify-center">
          <span className="absolute inset-0 animate-[success-burst_0.5s_ease-out]" />
          <svg
            className="h-3.5 w-3.5 animate-[pop-in_0.3s_ease-out]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </span>
      )}

      {/* Label */}
      <span
        className={cn(
          "transition-all duration-200",
          state === "holding" && (size === "xs" || size === "sm" ? "pr-3" : "pr-4"),
          state === "success" && "font-medium"
        )}
      >
        {getLabel()}
      </span>
    </button>
  );
}
