/**
 * Query-embedding cache (docs/09 §4.7): reuse a query's embedding for 5 minutes,
 * keyed by (workspace, capability, content_hash), so regenerations don't re-embed
 * the same query text. In-memory, per-process (consistent with the 3.3 circuit
 * breaker / budget-warning state; decision D16 — no shared store in v0.1).
 */

const TTL_MS = 5 * 60_000;

type Entry = { value: number[]; expiresAt: number };
const cache = new Map<string, Entry>();

function key(workspaceId: string, capability: string, contentHash: string): string {
  return `${workspaceId}:${capability}:${contentHash}`;
}

export function getCachedQueryEmbedding(
  workspaceId: string,
  capability: string,
  contentHash: string,
  now = Date.now(),
): number[] | null {
  const hit = cache.get(key(workspaceId, capability, contentHash));
  if (hit && hit.expiresAt > now) return hit.value;
  return null;
}

export function setCachedQueryEmbedding(
  workspaceId: string,
  capability: string,
  contentHash: string,
  value: number[],
  now = Date.now(),
): void {
  cache.set(key(workspaceId, capability, contentHash), { value, expiresAt: now + TTL_MS });
}

export function resetQueryEmbeddingCacheForTests(): void {
  cache.clear();
}
