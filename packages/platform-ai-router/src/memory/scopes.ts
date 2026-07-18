import type { Capability } from '../types';
import type { MemoryScope } from '../types';

/**
 * Per-capability memory scope allow-lists (docs/09 §4.3). The Router refuses any
 * scope not on a capability's list — "scope leakage is impossible by
 * construction." Sprint 3.4 registers the one live generation capability
 * (summarize-thread → none) and the generic embed writer. Every future
 * capability's row is added by the sprint that ships it.
 */
export type MemoryPolicy = {
  scopes: readonly MemoryScope[];
  topK: number;
  minSimilarity: number;
};

export const MEMORY_POLICY: Partial<Record<Capability, MemoryPolicy>> = {
  // Input is self-contained; retrieves nothing (docs/09 §4.3).
  'summarize-thread': { scopes: [], topK: 0, minSimilarity: 0 },
  // Embed-only capabilities: writers, never readers (docs/09 §4.3, §5.5).
  'embed-memory-generic': { scopes: [], topK: 0, minSimilarity: 0 },
  'embed-icp': { scopes: [], topK: 0, minSimilarity: 0 },
  'embed-offer': { scopes: [], topK: 0, minSimilarity: 0 },
  'embed-knowledge': { scopes: [], topK: 0, minSimilarity: 0 },
};

export function getMemoryPolicy(capability: Capability): MemoryPolicy {
  return MEMORY_POLICY[capability] ?? { scopes: [], topK: 0, minSimilarity: 0 };
}

/**
 * Throws if a requested scope is outside the capability's allow-list. `allowed`
 * defaults to the frozen policy but is passed explicitly by the pipeline so a
 * per-call policy override (tests, future tuning) is honored consistently.
 */
export function assertScopesAllowed(
  capability: Capability,
  requested: readonly MemoryScope[],
  allowed: readonly MemoryScope[] = getMemoryPolicy(capability).scopes,
): void {
  const allowedSet = new Set(allowed);
  const violation = requested.find((scope) => !allowedSet.has(scope));
  if (violation) {
    throw new Error(`capability ${capability} may not retrieve memory scope '${violation}'`);
  }
}
