/**
 * Fix UTF-8 mojibake (mis-decoded as Windows-1252/Latin-1)
 *
 * This happens when UTF-8 bytes are incorrectly interpreted as Windows-1252/Latin-1
 * Example: "ä" (C3 A4 in UTF-8) becomes "Ã¤" when decoded as Windows-1252
 *
 * Common in Outlook imports where encoding is mishandled.
 */

// Complete mapping of mojibake sequences to correct UTF-8 characters
// Based on user-provided list + common patterns
// Using unicode escapes where necessary to avoid parser issues
const ENCODING_FIXES: [string, string][] = [
  // ========== German umlauts & eszett ==========
  ["\u00C3\u00A4", "\u00E4"], // Ã¤ → ä
  ["\u00C3\u00B6", "\u00F6"], // Ã¶ → ö
  ["\u00C3\u00BC", "\u00FC"], // Ã¼ → ü
  ["\u00C3\u0178", "\u00DF"], // ÃŸ → ß
  ["\u00C3\u201E", "\u00C4"], // Ã„ → Ä
  ["\u00C3\u2013", "\u00D6"], // Ã– → Ö
  ["\u00C3\u0153", "\u00DC"], // Ãœ → Ü

  // ========== Lowercase accented vowels ==========
  ["\u00C3\u00A1", "\u00E1"], // Ã¡ → á
  ["\u00C3\u00A0", "\u00E0"], // Ã  → à (with regular space)
  ["\u00C3\u00A2", "\u00E2"], // Ã¢ → â
  ["\u00C3\u00A3", "\u00E3"], // Ã£ → ã
  ["\u00C3\u00A5", "\u00E5"], // Ã¥ → å
  ["\u00C3\u00A6", "\u00E6"], // Ã¦ → æ
  ["\u00C3\u00A7", "\u00E7"], // Ã§ → ç
  ["\u00C3\u00A8", "\u00E8"], // Ã¨ → è
  ["\u00C3\u00A9", "\u00E9"], // Ã© → é
  ["\u00C3\u00AA", "\u00EA"], // Ãª → ê
  ["\u00C3\u00AB", "\u00EB"], // Ã« → ë
  ["\u00C3\u00AC", "\u00EC"], // Ã¬ → ì
  ["\u00C3\u00AD", "\u00ED"], // Ã­ → í
  ["\u00C3\u00AE", "\u00EE"], // Ã® → î
  ["\u00C3\u00AF", "\u00EF"], // Ã¯ → ï
  ["\u00C3\u00B1", "\u00F1"], // Ã± → ñ
  ["\u00C3\u00B2", "\u00F2"], // Ã² → ò
  ["\u00C3\u00B3", "\u00F3"], // Ã³ → ó
  ["\u00C3\u00B4", "\u00F4"], // Ã´ → ô
  ["\u00C3\u00B5", "\u00F5"], // Ãµ → õ
  ["\u00C3\u00B8", "\u00F8"], // Ã¸ → ø
  ["\u00C3\u00B9", "\u00F9"], // Ã¹ → ù
  ["\u00C3\u00BA", "\u00FA"], // Ãº → ú
  ["\u00C3\u00BB", "\u00FB"], // Ã» → û
  ["\u00C3\u00BD", "\u00FD"], // Ã½ → ý
  ["\u00C3\u00BF", "\u00FF"], // Ã¿ → ÿ

  // ========== Uppercase accented vowels ==========
  ["\u00C3\u20AC", "\u00C0"], // Ã€ → À
  ["\u00C3\u0081", "\u00C1"], // Ã + control char → Á
  ["\u00C3\u201A", "\u00C2"], // Ã‚ → Â
  ["\u00C3\u0192", "\u00C3"], // Ãƒ → Ã
  ["\u00C3\u2026", "\u00C5"], // Ã… → Å
  ["\u00C3\u2020", "\u00C6"], // Ã† → Æ
  ["\u00C3\u2021", "\u00C7"], // Ã‡ → Ç
  ["\u00C3\u02C6", "\u00C8"], // Ãˆ → È
  ["\u00C3\u2030", "\u00C9"], // Ã‰ → É
  ["\u00C3\u0160", "\u00CA"], // ÃŠ → Ê
  ["\u00C3\u2039", "\u00CB"], // Ã‹ → Ë
  ["\u00C3\u0152", "\u00CC"], // ÃŒ → Ì
  ["\u00C3\u008D", "\u00CD"], // Ã + control → Í
  ["\u00C3\u017D", "\u00CE"], // ÃŽ → Î
  ["\u00C3\u008F", "\u00CF"], // Ã + control → Ï
  ["\u00C3\u2018", "\u00D1"], // Ã' → Ñ
  ["\u00C3\u2019", "\u00D2"], // Ã' → Ò
  ["\u00C3\u201C", "\u00D3"], // Ã" → Ó
  ["\u00C3\u201D", "\u00D4"], // Ã" → Ô
  ["\u00C3\u2022", "\u00D5"], // Ã• → Õ
  ["\u00C3\u02DC", "\u00D8"], // Ã˜ → Ø
  ["\u00C3\u2122", "\u00D9"], // Ã™ → Ù
  ["\u00C3\u0161", "\u00DA"], // Ãš → Ú
  ["\u00C3\u203A", "\u00DB"], // Ã› → Û
  ["\u00C3\u009D", "\u00DD"], // Ã + control → Ý

  // ========== Typographic quotes/dashes/ellipsis ==========
  ["\u00E2\u20AC\u2122", "\u2019"], // â€™ → ' (right single quote)
  ["\u00E2\u20AC\u02DC", "\u2018"], // â€˜ → ' (left single quote)
  ["\u00E2\u20AC\u0153", "\u201C"], // â€œ → " (left double quote)
  ["\u00E2\u20AC\u009D", "\u201D"], // â€ + control → " (right double quote)
  ["\u00E2\u20AC\u201C", "\u2013"], // â€" → – (en dash)
  ["\u00E2\u20AC\u201D", "\u2014"], // â€" → — (em dash, same pattern)
  ["\u00E2\u20AC\u00A6", "\u2026"], // â€¦ → … (ellipsis)

  // ========== Symbols ==========
  ["\u00C2\u00A9", "\u00A9"], // Â© → ©
  ["\u00C2\u00AE", "\u00AE"], // Â® → ®
  ["\u00E2\u201E\u00A2", "\u2122"], // â„¢ → ™
  ["\u00C2\u2122", "\u2122"], // Â™ → ™
  ["\u00C2\u00B0", "\u00B0"], // Â° → °
  ["\u00C2\u00B1", "\u00B1"], // Â± → ±
  ["\u00C2\u00B7", "\u00B7"], // Â· → ·
  ["\u00E2\u201A\u00AC", "\u20AC"], // â‚¬ → €
  ["\u00C2\u20AC", "\u20AC"], // Â€ → €
  ["\u00C2\u00A3", "\u00A3"], // Â£ → £
  ["\u00C2\u00A5", "\u00A5"], // Â¥ → ¥
  ["\u00C2\u00A2", "\u00A2"], // Â¢ → ¢
  ["\u00C2\u00A7", "\u00A7"], // Â§ → §
  ["\u00C2\u00B6", "\u00B6"], // Â¶ → ¶
  ["\u00C2\u00B5", "\u00B5"], // Âµ → µ
  ["\u00C2\u00BD", "\u00BD"], // Â½ → ½
  ["\u00C2\u00BC", "\u00BC"], // Â¼ → ¼
  ["\u00C2\u00BE", "\u00BE"], // Â¾ → ¾
];

// Markers that indicate mojibake is present
const MOJIBAKE_MARKERS = [
  "\u00C3", // Ã - Most common: UTF-8 lead byte C3 decoded as Latin-1
  "\u00C2", // Â - UTF-8 lead byte C2 decoded as Latin-1
  "\u00E2\u20AC", // â€ - UTF-8 sequence for smart quotes/dashes
  "\u00E2\u201E", // â„ - UTF-8 sequence for trademark etc.
  "\u00E2\u201A", // â‚ - UTF-8 sequence for currency
];

/**
 * Check if a string likely contains mojibake
 */
export function hasEncodingIssues(str: string | null | undefined): boolean {
  if (!str) return false;

  // Check for known mojibake sequences
  for (const [wrong] of ENCODING_FIXES) {
    if (str.includes(wrong)) return true;
  }

  // Check for mojibake markers that might not be in our explicit list
  for (const marker of MOJIBAKE_MARKERS) {
    if (str.includes(marker)) return true;
  }

  return false;
}

/**
 * Try to repair a string using latin1→utf8 conversion
 * This is a more generic approach that can catch cases not in our explicit mapping
 */
function tryLatin1ToUtf8Repair(str: string): string | null {
  try {
    // Convert string to latin1 bytes, then interpret as UTF-8
    // This reverses the common "UTF-8 decoded as Latin-1" mistake
    const bytes = Buffer.from(str, "latin1");
    const repaired = bytes.toString("utf8");

    // Validate the result:
    // 1. Should not contain replacement character (indicates invalid UTF-8)
    if (repaired.includes("\uFFFD")) return null;

    // 2. Should reduce mojibake markers (if not, repair didn't help)
    const originalMarkerCount = MOJIBAKE_MARKERS.reduce(
      (count, marker) => count + (str.split(marker).length - 1),
      0
    );
    const repairedMarkerCount = MOJIBAKE_MARKERS.reduce(
      (count, marker) => count + (repaired.split(marker).length - 1),
      0
    );

    if (repairedMarkerCount >= originalMarkerCount) return null;

    return repaired;
  } catch {
    return null;
  }
}

/**
 * Fix a single string with encoding issues
 * Uses explicit mapping first, then falls back to latin1→utf8 repair
 */
export function fixEncodingString(str: string | null | undefined): string | null {
  if (str === null || str === undefined) return null;
  if (str === "") return "";

  let fixed = str;

  // First pass: apply explicit mappings (most reliable)
  for (const [wrong, correct] of ENCODING_FIXES) {
    fixed = fixed.split(wrong).join(correct);
  }

  // Second pass: if mojibake markers remain, try latin1→utf8 repair
  // This catches edge cases not in our explicit mapping
  if (hasEncodingIssues(fixed)) {
    const repaired = tryLatin1ToUtf8Repair(fixed);
    if (repaired) {
      fixed = repaired;

      // Apply explicit mappings again in case repair revealed more mojibake
      for (const [wrong, correct] of ENCODING_FIXES) {
        fixed = fixed.split(wrong).join(correct);
      }
    }
  }

  // Third pass: handle double-encoding (apply up to 2 more times if needed)
  for (let i = 0; i < 2 && hasEncodingIssues(fixed); i++) {
    const prevFixed = fixed;
    for (const [wrong, correct] of ENCODING_FIXES) {
      fixed = fixed.split(wrong).join(correct);
    }
    // If no change, try latin1 repair again
    if (fixed === prevFixed) {
      const repaired = tryLatin1ToUtf8Repair(fixed);
      if (repaired && repaired !== fixed) {
        fixed = repaired;
      } else {
        break; // No more progress possible
      }
    }
  }

  return fixed;
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
  email?: string | null;
  notes?: string | null;
}): {
  company_name?: string;
  contact_name?: string;
  street?: string;
  city?: string;
  email?: string;
  notes?: string;
} | null {
  const fixes: Record<string, string> = {};
  let hasChanges = false;

  const fieldsToCheck: (keyof typeof contact)[] = [
    "company_name",
    "contact_name",
    "street",
    "city",
    "email",
    "notes",
  ];

  for (const field of fieldsToCheck) {
    const value = contact[field];
    if (value && hasEncodingIssues(value)) {
      const fixed = fixEncodingString(value);
      if (fixed && fixed !== value) {
        fixes[field] = fixed;
        hasChanges = true;
      }
    }
  }

  return hasChanges ? fixes : null;
}

/**
 * Fix encoding in a generic object's string fields
 * Useful for contact_persons, notes, etc.
 */
export function fixObjectEncoding<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): Partial<T> | null {
  const fixes: Partial<T> = {};
  let hasChanges = false;

  for (const field of fields) {
    const value = obj[field];
    if (typeof value === "string" && hasEncodingIssues(value)) {
      const fixed = fixEncodingString(value);
      if (fixed && fixed !== value) {
        (fixes as Record<string, unknown>)[field as string] = fixed;
        hasChanges = true;
      }
    }
  }

  return hasChanges ? fixes : null;
}

/**
 * Normalize a company name for duplicate detection
 * Applies encoding fix, then normalizes whitespace and case
 */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return "";

  // Fix encoding first
  let normalized = fixEncodingString(name) || name;

  // Normalize whitespace: collapse multiple spaces, trim
  normalized = normalized.replace(/\s+/g, " ").trim();

  // Case-insensitive comparison
  normalized = normalized.toLowerCase();

  return normalized;
}

/**
 * Normalize a phone number for duplicate detection
 * Strips all non-digit characters and normalizes international prefixes
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";

  // Strip all non-digit characters
  let normalized = phone.replace(/\D/g, "");

  // Normalize international prefixes:
  // +41... becomes 41...
  // 0041... becomes 41...
  // 041... (Swiss national with leading 0) stays as is for local matching
  if (normalized.startsWith("00")) {
    normalized = normalized.substring(2); // Remove leading 00
  }

  return normalized;
}
