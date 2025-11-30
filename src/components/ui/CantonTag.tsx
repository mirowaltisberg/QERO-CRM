"use client";

import { cn } from "@/lib/utils/cn";

const CANTON_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  ZH: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
  TG: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  GE: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
  VD: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
  TI: { bg: "bg-lime-100", text: "text-lime-800", border: "border-lime-200" },
  BS: { bg: "bg-indigo-100", text: "text-indigo-800", border: "border-indigo-200" },
  AG: { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-200" },
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

