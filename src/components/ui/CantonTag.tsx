"use client";

import { cn } from "@/lib/utils/cn";

type CantonColor = { bg: string; text: string; border: string };

const cantonColor = (hex: string, text: string = "#ffffff"): CantonColor => ({
  bg: hex,
  text,
  border: hex,
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

function getCantonPalette(canton: string | null | undefined) {
  if (!canton) return null;
  return CANTON_COLORS[canton] ?? null;
}

interface CantonTagProps {
  canton?: string | null;
  onClick?: (canton: string) => void;
  size?: "sm" | "md";
}

export function CantonTag({ canton, onClick, size = "sm" }: CantonTagProps) {
  const palette = getCantonPalette(canton);
  const classes = cn(
    "inline-flex items-center rounded-full border font-medium transition-all duration-200",
    size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
    onClick && "cursor-pointer hover:-translate-y-0.5 shadow-sm"
  );
  const style = palette
    ? {
        backgroundColor: palette.bg,
        color: palette.text,
        borderColor: palette.border,
      }
    : undefined;

  if (onClick && canton) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(canton);
        }}
      >
        {canton}
      </button>
    );
  }

  return (
    <span
      className={classes}
      style={
        style ?? {
          backgroundColor: "#F3F4F6",
          color: "#6B7280",
          borderColor: "#E5E7EB",
        }
      }
    >
      {canton ?? "—"}
    </span>
  );
}

