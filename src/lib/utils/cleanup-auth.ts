/**
 * Authorization for data cleanup operations
 * 
 * Restricts dangerous operations (encoding fix, duplicate merge, restore)
 * to specific allowed email addresses.
 */

// Allowed emails for cleanup operations (from env var or hardcoded fallback)
const ALLOWED_EMAILS_ENV = process.env.DATA_CLEANUP_ALLOWED_EMAILS;

const ALLOWED_EMAILS: string[] = ALLOWED_EMAILS_ENV
  ? ALLOWED_EMAILS_ENV.split(",").map((e) => e.trim().toLowerCase())
  : [
      // Fallback hardcoded list (as specified by user)
      "shtanaj@qero.ch",
      "m.waltisberg@qero.ch",
    ];

/**
 * Check if a user email is allowed to run cleanup operations
 */
export function isCleanupAllowed(userEmail: string | null | undefined): boolean {
  if (!userEmail) return false;
  return ALLOWED_EMAILS.includes(userEmail.toLowerCase().trim());
}

/**
 * Get the list of allowed emails (for debugging/admin UI)
 */
export function getAllowedCleanupEmails(): string[] {
  return [...ALLOWED_EMAILS];
}
