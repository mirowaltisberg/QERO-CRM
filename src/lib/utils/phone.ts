/**
 * Phone number utilities for formatting and WhatsApp links
 */

/**
 * Normalize a Swiss phone number to E.164 format (e.g., +41791234567)
 * Handles formats like:
 * - +41 79 123 45 67
 * - 0791234567
 * - 079 123 45 67
 * - +41791234567
 * - +41 (0) 79 123 45 67 (common European format with optional 0)
 */
export function normalizePhoneToE164(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Remove the common "(0)" pattern used in European phone numbers
  // e.g., "+41 (0) 79" -> "+41 79"
  let cleaned = phone.replace(/\(0\)/g, "");

  // Remove all non-digit characters except leading +
  cleaned = cleaned.replace(/[^\d+]/g, "");

  // If starts with 00, convert to +
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  // If starts with 0 (Swiss local format), convert to +41
  if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
    cleaned = "+41" + cleaned.slice(1);
  }

  // If doesn't start with +, assume Swiss and add +41
  if (!cleaned.startsWith("+")) {
    // If it's already 10+ digits, might be international
    if (cleaned.length >= 10) {
      cleaned = "+41" + cleaned;
    } else {
      return null; // Too short to be valid
    }
  }

  // Validate: should be + followed by 10-15 digits
  const digitsOnly = cleaned.replace("+", "");
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return null;
  }

  return cleaned;
}

/**
 * Get digits-only version for wa.me links (without the +)
 */
export function getWhatsAppDigits(phone: string | null | undefined): string | null {
  const e164 = normalizePhoneToE164(phone);
  if (!e164) return null;
  return e164.replace("+", "");
}

/**
 * Generate a WhatsApp link for the given phone number
 */
export function getWhatsAppLink(phone: string | null | undefined): string | null {
  const digits = getWhatsAppDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

/**
 * Format phone number for display (keeps original format if valid, otherwise returns as-is)
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone;
}

