"use client";

import { memo } from "react";
import { cn } from "@/lib/utils/cn";
import { DRIVING_LICENSE_LABELS, DRIVING_LICENSE_SHORT, type DrivingLicense } from "@/lib/utils/constants";

interface DrivingLicenseBadgeProps {
  license: DrivingLicense | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

// Simple icons for license types
function LicenseIcon({ license, className }: { license: DrivingLicense; className?: string }) {
  // Show X for no license, checkmark for license, car for license+car
  if (license === "none") {
    // X icon
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  
  if (license === "B_car" || license === "BE_car") {
    // Car icon
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M5 17h14v-4l-2-4H7l-2 4v4z" />
        <path d="M5 13h14" />
        <circle cx="7.5" cy="17" r="1.5" />
        <circle cx="16.5" cy="17" r="1.5" />
      </svg>
    );
  }
  
  // Checkmark for license without car
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

const COLORS: Record<DrivingLicense, { bg: string; text: string; border: string }> = {
  none: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
  B: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  BE: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  B_car: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
  BE_car: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
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

// Simple Yes/No button component
interface YesNoButtonProps {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  size?: "sm" | "md";
}

function YesNoButton({ label, value, onChange, size = "md" }: YesNoButtonProps) {
  const isSmall = size === "sm";
  
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        "font-medium text-gray-700",
        isSmall ? "text-xs" : "text-sm"
      )}>
        {label}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            "rounded-lg border font-medium transition-all",
            isSmall ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === true
              ? "bg-emerald-500 text-white border-emerald-500"
              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
          )}
        >
          Ja
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            "rounded-lg border font-medium transition-all",
            isSmall ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === false
              ? "bg-gray-500 text-white border-gray-500"
              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
          )}
        >
          Nein
        </button>
      </div>
    </div>
  );
}

// Simple driving license selector with two-step approach
interface DrivingLicenseSelectorProps {
  value: DrivingLicense | "" | null;
  onChange: (value: DrivingLicense | null) => void;
  size?: "sm" | "md";
}

export const DrivingLicenseSelector = memo(function DrivingLicenseSelector({
  value,
  onChange,
  size = "md",
}: DrivingLicenseSelectorProps) {
  // Derive boolean states from the value
  // null or "" = not set, "none" = no license, "B" = license no car, "B_car" = license + car
  const hasLicense = value === "B" || value === "BE" || value === "B_car" || value === "BE_car";
  const hasCar = value === "B_car" || value === "BE_car";
  const hasNoLicense = value === "none";
  
  const handleLicenseChange = (hasIt: boolean) => {
    if (hasIt) {
      // Default to license without car
      onChange("B");
    } else {
      onChange("none");
    }
  };
  
  const handleCarChange = (hasIt: boolean) => {
    if (hasIt) {
      onChange("B_car");
    } else {
      onChange("B");
    }
  };
  
  return (
    <div className="flex flex-col gap-3">
      <YesNoButton
        label="Autoprüfung?"
        value={hasLicense ? true : hasNoLicense ? false : null}
        onChange={handleLicenseChange}
        size={size}
      />
      
      {hasLicense && (
        <YesNoButton
          label="Privatauto?"
          value={hasCar}
          onChange={handleCarChange}
          size={size}
        />
      )}
    </div>
  );
});
