/**
 * Contact Deduplication Logic
 *
 * Detects and groups duplicate companies based on:
 * - Same phone number (normalized)
 * - Same company name (after encoding fix + normalization)
 */

import { normalizeCompanyName, normalizePhone } from "./fix-encoding";

export interface ContactForDedupe {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  canton: string | null;
  postal_code: string | null;
  created_at: string | null;
  team_id: string | null;
}

export interface DuplicateGroup {
  primaryId: string;
  primaryName: string;
  duplicateIds: string[];
  duplicateNames: string[];
  matchReason: "phone" | "name" | "both";
}

/**
 * Union-Find data structure for grouping duplicates
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }

    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }

    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getGroups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(id);
    }

    return groups;
  }
}

/**
 * Find duplicate groups among contacts
 */
export function findDuplicateGroups(contacts: ContactForDedupe[]): DuplicateGroup[] {
  const uf = new UnionFind();
  const contactMap = new Map<string, ContactForDedupe>();

  // Build lookup maps
  const byNormalizedPhone = new Map<string, string[]>();
  const byNormalizedName = new Map<string, string[]>();

  for (const contact of contacts) {
    contactMap.set(contact.id, contact);

    // Index by normalized phone
    if (contact.phone) {
      const normalizedPhone = normalizePhone(contact.phone);
      if (normalizedPhone.length >= 6) {
        // At least 6 digits to be considered a valid phone
        if (!byNormalizedPhone.has(normalizedPhone)) {
          byNormalizedPhone.set(normalizedPhone, []);
        }
        byNormalizedPhone.get(normalizedPhone)!.push(contact.id);
      }
    }

    // Index by normalized name
    if (contact.company_name) {
      const normalizedName = normalizeCompanyName(contact.company_name);
      if (normalizedName.length >= 3) {
        // At least 3 chars to be considered
        if (!byNormalizedName.has(normalizedName)) {
          byNormalizedName.set(normalizedName, []);
        }
        byNormalizedName.get(normalizedName)!.push(contact.id);
      }
    }
  }

  // Track match reasons
  const matchReasons = new Map<string, Set<"phone" | "name">>();

  function addMatchReason(id1: string, id2: string, reason: "phone" | "name") {
    const key = [id1, id2].sort().join("|");
    if (!matchReasons.has(key)) {
      matchReasons.set(key, new Set());
    }
    matchReasons.get(key)!.add(reason);
  }

  // Union contacts with same phone
  for (const [, ids] of byNormalizedPhone) {
    if (ids.length > 1) {
      for (let i = 1; i < ids.length; i++) {
        uf.union(ids[0], ids[i]);
        addMatchReason(ids[0], ids[i], "phone");
      }
    }
  }

  // Union contacts with same name
  for (const [, ids] of byNormalizedName) {
    if (ids.length > 1) {
      for (let i = 1; i < ids.length; i++) {
        uf.union(ids[0], ids[i]);
        addMatchReason(ids[0], ids[i], "name");
      }
    }
  }

  // Get groups and filter to only those with multiple members
  const groups = uf.getGroups();
  const duplicateGroups: DuplicateGroup[] = [];

  for (const [, memberIds] of groups) {
    if (memberIds.length <= 1) continue;

    // Pick primary: prefer contacts with more filled fields, then oldest
    const sorted = memberIds
      .map((id) => contactMap.get(id)!)
      .sort((a, b) => {
        // Score by filled fields
        const scoreA = countFilledFields(a);
        const scoreB = countFilledFields(b);

        if (scoreB !== scoreA) return scoreB - scoreA; // Higher score first

        // Tiebreaker: oldest created_at
        const dateA = a.created_at ? new Date(a.created_at).getTime() : Date.now();
        const dateB = b.created_at ? new Date(b.created_at).getTime() : Date.now();
        return dateA - dateB;
      });

    const primary = sorted[0];
    const duplicates = sorted.slice(1);

    // Determine match reason for the group
    let hasPhoneMatch = false;
    let hasNameMatch = false;

    for (const dup of duplicates) {
      const key = [primary.id, dup.id].sort().join("|");
      const reasons = matchReasons.get(key);
      if (reasons?.has("phone")) hasPhoneMatch = true;
      if (reasons?.has("name")) hasNameMatch = true;
    }

    const matchReason: "phone" | "name" | "both" =
      hasPhoneMatch && hasNameMatch ? "both" : hasPhoneMatch ? "phone" : "name";

    duplicateGroups.push({
      primaryId: primary.id,
      primaryName: primary.company_name || "(unnamed)",
      duplicateIds: duplicates.map((d) => d.id),
      duplicateNames: duplicates.map((d) => d.company_name || "(unnamed)"),
      matchReason,
    });
  }

  return duplicateGroups;
}

function countFilledFields(contact: ContactForDedupe): number {
  let count = 0;
  if (contact.company_name) count++;
  if (contact.contact_name) count++;
  if (contact.phone) count++;
  if (contact.email) count++;
  if (contact.street) count++;
  if (contact.city) count++;
  if (contact.canton) count++;
  if (contact.postal_code) count++;
  return count;
}

/**
 * Merge scalar fields from duplicate into primary
 * Only fills empty fields, doesn't overwrite existing values
 */
export function mergeContactFields(
  primary: ContactForDedupe,
  duplicate: ContactForDedupe
): Partial<ContactForDedupe> {
  const updates: Partial<ContactForDedupe> = {};

  const fields: (keyof ContactForDedupe)[] = [
    "contact_name",
    "phone",
    "email",
    "street",
    "city",
    "canton",
    "postal_code",
  ];

  for (const field of fields) {
    if (!primary[field] && duplicate[field]) {
      (updates as Record<string, unknown>)[field] = duplicate[field];
    }
  }

  return updates;
}
