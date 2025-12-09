"use client";

import { memo } from "react";
import { cn } from "@/lib/utils/cn";
import { DRIVING_LICENSE_LABELS, DRIVING_LICENSE_SHORT, type DrivingLicense } from "@/lib/utils/constants";

interface DrivingLicenseBadgeProps {
  license: DrivingLicense | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

// Icons for each license type
function LicenseIcon({ license, className }: { license: DrivingLicense; className?: string }) {
  switch (license) {
    case "none":
      // Crossed out steering wheel
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
          <path d="M4 4l16 16" strokeWidth={2.5} />
        </svg>
      );
    case "B":
      // License/card icon
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M6 9h4M6 13h8" />
          <circle cx="17" cy="11" r="2" />
        </svg>
      );
    case "BE":
      // License with trailer indicator
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="1" y="5" width="15" height="12" rx="2" />
          <path d="M4 9h3M4 12h6" />
          <rect x="17" y="8" width="6" height="6" rx="1" />
          <path d="M16 11h1" />
        </svg>
      );
    case "B_car":
      // Car icon
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M5 17h14v-4l-2-4H7l-2 4v4z" />
          <path d="M5 13h14" />
          <circle cx="7.5" cy="17" r="1.5" />
          <circle cx="16.5" cy="17" r="1.5" />
        </svg>
      );
    case "BE_car":
      // Car with trailer
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M2 15h9v-3l-1.5-3h-6L2 12v3z" />
          <circle cx="4" cy="15" r="1.5" />
          <circle cx="9" cy="15" r="1.5" />
          <path d="M11 13h2" />
          <rect x="13" y="11" width="9" height="4" rx="1" />
          <circle cx="17" cy="15" r="1.5" />
        </svg>
      );
  }
}

const COLORS: Record<DrivingLicense, { bg: string; text: string; border: string }> = {
  none: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
  B: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
  BE: { bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-200" },
  B_car: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  BE_car: { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200" },
};

const SIZES = {
  sm: { icon: "h-3 w-3", text: "text-[10px]", padding: "px-1.5 py-0.5", gap: "gap-1" },
  md: { icon: "h-4 w-4", text: "text-xs", padding: "px-2 py-1", gap: "gap-1.5" },
  lg: { icon: "h-5 w-5", text: "text-sm", padding: "px-3 py-1.5", gap: "gap-2" },
};

export const DrivingLicenseBadge = memo(function DrivingLicenseBadge({
  license,
  size = "md",
  showLabel = true,
}: DrivingLicenseBadgeProps) {
  if (!license) return null;

  const colors = COLORS[license];
  const sizeStyles = SIZES[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        colors.bg,
        colors.text,
        colors.border,
        sizeStyles.padding,
        sizeStyles.gap
      )}
    >
      <LicenseIcon license={license} className={sizeStyles.icon} />
      {showLabel && (
        <span className={sizeStyles.text}>
          {size === "sm" ? DRIVING_LICENSE_SHORT[license] : DRIVING_LICENSE_LABELS[license]}
        </span>
      )}
    </span>
  );
});

// Selector component for forms
interface DrivingLicenseSelectorProps {
  value: DrivingLicense | "";
  onChange: (value: DrivingLicense | "") => void;
  size?: "sm" | "md";
}

export const DrivingLicenseSelector = memo(function DrivingLicenseSelector({
  value,
  onChange,
  size = "md",
}: DrivingLicenseSelectorProps) {
  const licenses: (DrivingLicense | "")[] = ["", "none", "B", "BE", "B_car", "BE_car"];
  
  const isSmall = size === "sm";
  
  return (
    <div className="flex flex-wrap gap-1.5">
      {licenses.map((license) => {
        const isSelected = value === license;
        const colors = license ? COLORS[license] : null;
        
        return (
          <button
            key={license || "any"}
            type="button"
            onClick={() => onChange(license)}
            className={cn(
              "inline-flex items-center rounded-lg border transition-all font-medium",
              isSmall ? "px-2 py-1.5 text-xs gap-1" : "px-3 py-2 text-sm gap-1.5",
              isSelected
                ? license
                  ? `${colors?.bg} ${colors?.text} ${colors?.border} ring-2 ring-offset-1 ring-current/30`
                  : "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            )}
          >
            {license ? (
              <>
                <LicenseIcon license={license} className={isSmall ? "h-3.5 w-3.5" : "h-4 w-4"} />
                <span>{isSmall ? DRIVING_LICENSE_SHORT[license] : DRIVING_LICENSE_LABELS[license]}</span>
              </>
            ) : (
              <span>Egal</span>
            )}
          </button>
        );
      })}
    </div>
  );
});
