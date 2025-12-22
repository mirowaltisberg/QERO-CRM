/**
 * Utility for mapping Outlook folder names to specialization categories
 */

/**
 * Derive specialization from folder name based on keywords
 */
export function deriveSpecializationFromFolderName(folderName: string): string | null {
  const lowerName = folderName.toLowerCase();
  
  if (lowerName.includes("dach") || lowerName.includes("spengler")) {
    return "dachdecker";
  }
  
  if (lowerName.includes("holz") || lowerName.includes("schreiner") || lowerName.includes("zimmer")) {
    return "holzbau";
  }
  
  // Could add more in the future:
  // if (lowerName.includes("elektro")) return "elektro";
  // if (lowerName.includes("sanitär")) return "sanitaer";
  
  return null;
}

/**
 * Available specialization options for UI dropdowns
 */
export const SPECIALIZATION_OPTIONS = [
  { value: null, label: "Keine" },
  { value: "holzbau", label: "Holzbau / Schreinerei" },
  { value: "dachdecker", label: "Dachdecker / Spengler" },
] as const;

/**
 * Get display label for specialization value
 */
export function getSpecializationLabel(value: string | null): string {
  const option = SPECIALIZATION_OPTIONS.find(o => o.value === value);
  return option?.label || "Keine";
}

/**
 * Get color classes for specialization badge
 */
export function getSpecializationColor(value: string | null): string {
  switch (value) {
    case "holzbau":
      return "bg-amber-100 text-amber-800";
    case "dachdecker":
      return "bg-slate-100 text-slate-800";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

