"use client";

import { memo } from "react";
import type { VacancyUrgency } from "@/lib/types";
import { VACANCY_URGENCY_LABELS, VACANCY_URGENCY_COLORS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils/cn";

interface Props {
  urgency: VacancyUrgency;
  showLabel?: boolean;
  size?: "sm" | "md";
}

const FlameIcon = ({ className }: { className?: string }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    <path d="M12 23c-3.866 0-7-3.134-7-7 0-2.525 1.371-4.736 3.5-6.024V7c0-2.209 1.791-4 4-4h.5c.276 0 .5.224.5.5V7c0 1.657 1.343 3 3 3h1c.552 0 1 .448 1 1v1c0 1.657-1.343 3-3 3-.771 0-1.468-.301-2-.776V16c0 2.761 2.239 5 5 5 .552 0 1 .448 1 1s-.448 1-1 1h-6zm-2-7c0 1.657 1.343 3 3 3s3-1.343 3-3c0-1.306-.835-2.417-2-2.829V10.1c1.163-.413 2-1.524 2-2.829V5.5c0-.276-.224-.5-.5-.5H13c-1.105 0-2 .895-2 2v3.171c-1.165.412-2 1.523-2 2.829v3z"/>
  </svg>
);

// Simpler, more recognizable flame
const SimpleFlame = ({ className, animate }: { className?: string; animate?: boolean }) => (
  <svg 
    className={cn(className, animate && "animate-pulse")} 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    <path d="M12 2C8.5 6 6 9.5 6 13c0 3.31 2.69 6 6 6s6-2.69 6-6c0-3.5-2.5-7-6-11zm0 15c-2.21 0-4-1.79-4-4 0-2.25 1.5-4.5 4-7.5 2.5 3 4 5.25 4 7.5 0 2.21-1.79 4-4 4z"/>
  </svg>
);

export const UrgencyBadge = memo(function UrgencyBadge({ 
  urgency, 
  showLabel = true,
  size = "md" 
}: Props) {
  const colors = VACANCY_URGENCY_COLORS[urgency];
  const label = VACANCY_URGENCY_LABELS[urgency];
  
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const gap = size === "sm" ? "gap-0.5" : "gap-1";
  
  return (
    <span className={cn("inline-flex items-center", gap, colors.text)}>
      {/* Render flames based on urgency level */}
      <span className={cn("flex items-center", size === "sm" ? "-space-x-1" : "-space-x-1.5")}>
        {Array.from({ length: urgency }).map((_, i) => (
          <SimpleFlame 
            key={i} 
            className={iconSize}
            animate={urgency === 3}
          />
        ))}
      </span>
      {showLabel && (
        <span className={cn("font-medium", textSize)}>
          {label}
        </span>
      )}
    </span>
  );
});

// Urgency selector for forms
interface UrgencySelectorProps {
  value: VacancyUrgency;
  onChange: (urgency: VacancyUrgency) => void;
}

export const UrgencySelector = memo(function UrgencySelector({
  value,
  onChange,
}: UrgencySelectorProps) {
  return (
    <div className="flex gap-2">
      {([1, 2, 3] as VacancyUrgency[]).map((level) => {
        const isSelected = value === level;
        const colors = VACANCY_URGENCY_COLORS[level];
        const label = VACANCY_URGENCY_LABELS[level];
        
        return (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 rounded-lg border-2 py-3 px-2 transition-all",
              isSelected 
                ? cn("border-current", colors.text, colors.bg)
                : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500"
            )}
          >
            <span className={cn("flex items-center -space-x-1", isSelected && colors.text)}>
              {Array.from({ length: level }).map((_, i) => (
                <SimpleFlame 
                  key={i} 
                  className="h-5 w-5"
                  animate={isSelected && level === 3}
                />
              ))}
            </span>
            <span className={cn(
              "text-xs font-medium",
              isSelected ? colors.text : "text-gray-500"
            )}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
});
