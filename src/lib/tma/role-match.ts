/**
 * Role matching utilities for TMA candidates
 * Used by match-candidates and team-candidates endpoints
 */

import type { TmaRole } from "@/lib/types";

// Common suffixes/prefixes to ignore when matching roles
const IGNORE_WORDS = new Set([
  "efz",
  "eba",
  "hf",
  "bp",
  "dipl",
  "ing",
  "bsc",
  "msc",
]);

/**
 * Extract the core role name by removing common suffixes like EFZ, EBA, etc.
 */
export function getCoreRoleName(role: string): string {
  return role
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => !IGNORE_WORDS.has(word))
    .join(" ")
    .trim();
}

/**
 * Check if two roles match (strict matching on core role name)
 */
export function rolesMatch(
  positionTitle: string,
  searchedRole: string
): boolean {
  const corePosition = getCoreRoleName(positionTitle);
  const coreSearched = getCoreRoleName(searchedRole);

  if (!corePosition || !coreSearched) return false;

  // Exact match or one contains the other
  return (
    corePosition.includes(coreSearched) || coreSearched.includes(corePosition)
  );
}

/**
 * Find the best matching role for a position title from a list of roles.
 * Returns null if no role matches.
 * Prefers the longest core role name match (most specific).
 */
export function findBestMatchingRole(
  positionTitle: string | null,
  roles: Pick<TmaRole, "id" | "name" | "color">[]
): Pick<TmaRole, "id" | "name" | "color"> | null {
  if (!positionTitle) return null;

  const corePosition = getCoreRoleName(positionTitle);
  if (!corePosition) return null;

  let bestRole: Pick<TmaRole, "id" | "name" | "color"> | null = null;
  let bestMatchLength = 0;

  for (const role of roles) {
    const coreRole = getCoreRoleName(role.name);
    if (!coreRole) continue;

    // Check if they match
    if (
      corePosition.includes(coreRole) ||
      coreRole.includes(corePosition)
    ) {
      // Prefer longer core role names (more specific match)
      if (coreRole.length > bestMatchLength) {
        bestMatchLength = coreRole.length;
        bestRole = role;
      }
    }
  }

  return bestRole;
}

