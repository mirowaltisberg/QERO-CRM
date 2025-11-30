"use client";

import { cn } from "@/lib/utils/cn";

type CantonColor = { bg: string; text: string; border: string };

const cantonColor = (hex: string, text: "text-white" | "text-black" = "text-white"): CantonColor => ({
  bg: `bg-[${hex}]`,
  text,
  border: `border-[${hex}]`,
});

const CANTON_COLORS: Record<string, CantonColor> = {
  ZH: cantonColor("#0078FF"),
  BE: cantonColor("#C60000"),
  LU: cantonColor("#0057B8"),
  UR: cantonColor("#FFD200", "text-black"),
  SZ: cantonColor("#D80027"),
  OW: cantonColor("#B80F0A"),
  NW: cantonColor("#E6001A"),
  GL: cantonColor("#FF4B00"),
  ZG: cantonColor("#1E81B0"),
  FR: cantonColor("#2D2D2D"),
  SO: cantonColor("#FF0000"),
  BS: cantonColor("#1A1A1A"),
  BL: cantonColor("#E2001A"),
  SH: cantonColor("#F7C600", "text-black"),
  AR: cantonColor("#999999", "text-black"),
  AI: cantonColor("#000000"),
  SG: cantonColor("#007A3D"),
  GR: cantonColor("#005087"),
  AG: cantonColor("#0083CA"),
  TG: cantonColor("#4CAF50"),
};

function getCantonStyles(canton: string | null | undefined) {
  if (!canton) {
    return "bg-gray-100 text-gray-500 border-gray-200";
  }
  const palette = CANTON_COLORS[canton];
  if (palette) {
    return `${palette.bg} ${palette.text} ${palette.border}`;
  }
  return "bg-slate-100 text-slate-600 border-slate-200";
}

interface CantonTagProps {
  canton?: string | null;
  onClick?: (canton: string) => void;
  size?: "sm" | "md";
}

export function CantonTag({ canton, onClick, size = "sm" }: CantonTagProps) {
  const classes = cn(
    "inline-flex items-center rounded-full border font-medium transition-all duration-200",
    size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
    getCantonStyles(canton),
    onClick && "cursor-pointer hover:-translate-y-0.5 shadow-sm"
  );

  if (onClick && canton) {
    return (
      <button
        type="button"
        className={classes}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(canton);
        }}
      >
        {canton}
      </button>
    );
  }

  return <span className={classes}>{canton ?? "—"}</span>;
}

