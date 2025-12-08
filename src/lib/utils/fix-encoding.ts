/**
 * Fix UTF-8 mojibake (mis-decoded as Windows-1252)
 * 
 * This happens when UTF-8 bytes are incorrectly interpreted as Windows-1252/Latin-1
 * Example: "ä" (C3 A4 in UTF-8) becomes "Ã¤" when decoded as Windows-1252
 */

// Mapping of mojibake sequences to correct UTF-8 characters
const ENCODING_FIXES: [string, string][] = [
  // Lowercase umlauts
  ["Ã¤", "ä"],
  ["Ã¶", "ö"],
  ["Ã¼", "ü"],
  // Uppercase umlauts
  ["Ã„", "Ä"],
  ["Ã–", "Ö"],
  ["Ãœ", "Ü"],
  // Eszett
  ["ÃŸ", "ß"],
  // French accents (common in Swiss names)
  ["Ã©", "é"],
  ["Ã¨", "è"],
  ["Ãª", "ê"],
  ["Ã ", "à"],
  ["Ã¢", "â"],
  ["Ã®", "î"],
  ["Ã´", "ô"],
  ["Ã»", "û"],
  ["Ã§", "ç"],
  // Uppercase French
  ["Ã‰", "É"],
  ["Ãˆ", "È"],
  ["Ã€", "À"],
  ["Ã‡", "Ç"],
];

/**
 * Fix a single string with encoding issues
 */
export function fixEncodingString(str: string | null | undefined): string | null {
  if (!str) return str as null;
  
  let fixed = str;
  for (const [wrong, correct] of ENCODING_FIXES) {
    fixed = fixed.split(wrong).join(correct);
  }
  
  return fixed;
}

/**
 * Check if a string has encoding issues
 */
export function hasEncodingIssues(str: string | null | undefined): boolean {
  if (!str) return false;
  
  return ENCODING_FIXES.some(([wrong]) => str.includes(wrong));
}

/**
 * Fix encoding issues in a contact object
 * Returns the fixed fields if any changes were made, or null if no changes needed
 */
export function fixContactEncoding(contact: {
  company_name?: string | null;
  contact_name?: string | null;
  street?: string | null;
  city?: string | null;
}): { company_name?: string; contact_name?: string; street?: string; city?: string } | null {
  const fixes: Record<string, string> = {};
  let hasChanges = false;

  if (contact.company_name && hasEncodingIssues(contact.company_name)) {
    fixes.company_name = fixEncodingString(contact.company_name)!;
    hasChanges = true;
  }

  if (contact.contact_name && hasEncodingIssues(contact.contact_name)) {
    fixes.contact_name = fixEncodingString(contact.contact_name)!;
    hasChanges = true;
  }

  if (contact.street && hasEncodingIssues(contact.street)) {
    fixes.street = fixEncodingString(contact.street)!;
    hasChanges = true;
  }

  if (contact.city && hasEncodingIssues(contact.city)) {
    fixes.city = fixEncodingString(contact.city)!;
    hasChanges = true;
  }

  return hasChanges ? fixes : null;
}
