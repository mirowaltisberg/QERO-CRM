/**
 * Build unique, truthy string batches with a max batch size.
 */
export function chunkUnique(items: Array<string | null | undefined>, batchSize = 200): string[][] {
  const size = Math.max(1, batchSize);
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    batches.push(unique.slice(i, i + size));
  }

  return batches;
}
