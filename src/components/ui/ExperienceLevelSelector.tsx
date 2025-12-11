"use client";

import { memo } from "react";
import { cn } from "@/lib/utils/cn";
import {
  EXPERIENCE_LEVEL_LIST,
  EXPERIENCE_LEVEL_LABELS,
  EXPERIENCE_LEVEL_FULL_LABELS,
  EXPERIENCE_LEVEL_COLORS,
  type ExperienceLevel,
} from "@/lib/utils/constants";

interface ExperienceLevelBadgeProps {
  level: ExperienceLevel | null;
  size?: "sm" | "md" | "lg";
  showFullLabel?: boolean;
}

const SIZES = {
  sm: { text: "text-[10px]", padding: "px-1.5 py-0.5" },
  md: { text: "text-xs", padding: "px-2 py-1" },
  lg: { text: "text-sm", padding: "px-3 py-1.5" },
};

export const ExperienceLevelBadge = memo(function ExperienceLevelBadge({
  level,
  size = "md",
  showFullLabel = false,
}: ExperienceLevelBadgeProps) {
  if (!level) return null;

  const colors = EXPERIENCE_LEVEL_COLORS[level];
  const sizeStyles = SIZES[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        colors.bg,
        colors.text,
        colors.border,
        sizeStyles.padding,
        sizeStyles.text
      )}
    >
      {showFullLabel ? EXPERIENCE_LEVEL_FULL_LABELS[level] : EXPERIENCE_LEVEL_LABELS[level]}
    </span>
  );
});

interface ExperienceLevelSelectorProps {
  value: ExperienceLevel | null;
  onChange: (value: ExperienceLevel | null) => void;
  size?: "sm" | "md";
  allowClear?: boolean;
}

export const ExperienceLevelSelector = memo(function ExperienceLevelSelector({
  value,
  onChange,
  size = "md",
  allowClear = true,
}: ExperienceLevelSelectorProps) {
  const isSmall = size === "sm";

  return (
    <div className="flex flex-col gap-2">
      <span className={cn(
        "font-medium text-gray-700",
        isSmall ? "text-xs" : "text-sm"
      )}>
        Berufserfahrung
      </span>
      <div className="flex flex-wrap gap-2">
        {EXPERIENCE_LEVEL_LIST.map((level) => {
          const isSelected = value === level;
          const colors = EXPERIENCE_LEVEL_COLORS[level];
          
          return (
            <button
              key={level}
              type="button"
              onClick={() => {
                if (isSelected && allowClear) {
                  onChange(null);
                } else {
                  onChange(level);
                }
              }}
              className={cn(
                "rounded-lg border font-medium transition-all",
                isSmall ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
                isSelected
                  ? cn(colors.bg, colors.text, colors.border)
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              )}
            >
              {EXPERIENCE_LEVEL_FULL_LABELS[level]}
            </button>
          );
        })}
      </div>
    </div>
  );
});
