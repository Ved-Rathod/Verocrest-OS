import type { Capability } from '../types';
import { getBaselinePrompt, type PromptDefinition } from './baselines';

/**
 * Prompt Registry (docs/09 §3). Resolution chain (§3.4 / docs/04 §18.3):
 * workspace override → global default → code baseline. DB tiers are provided
 * through the PromptStore port (fail-soft: a DB error resolves to the next
 * tier, never fails the call). Resolution is LRU-cached for 60s per
 * (workspace, capability) (docs/09 §2.9).
 */

export type ResolvedPrompt = PromptDefinition & {
  /** prompt_library.id when resolved from a DB tier (docs/04 §18.1 rev 2). */
  promptLibraryId?: string;
  source: 'workspace' | 'global' | 'code';
};

/** Port over prompt_library — implemented by Supabase server-side, fakes in tests. */
export interface PromptStore {
  /**
   * Active default prompt for (workspaceId|null, capability), or null. When
   * `versionPin` is set, that exact version is fetched instead of the active
   * default (docs/09 §3.5).
   */
  getActivePrompt(
    workspaceId: string | null,
    capability: Capability,
    versionPin?: number,
  ): Promise<ResolvedPrompt | null>;
}

const CACHE_TTL_MS = 60_000;
type CacheEntry = { value: ResolvedPrompt; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export function clearPromptCacheForTests(): void {
  cache.clear();
}

export async function resolvePrompt(
  store: PromptStore | null,
  workspaceId: string,
  capability: Capability,
  versionPin?: number,
): Promise<ResolvedPrompt> {
  const key = `${workspaceId}:${capability}:${versionPin ?? 'default'}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let resolved: ResolvedPrompt | null = null;
  if (store) {
    try {
      resolved = (await store.getActivePrompt(workspaceId, capability, versionPin)) ?? null;
      resolved ??= await store.getActivePrompt(null, capability, versionPin);
    } catch {
      resolved = null; // fail-soft to the code baseline (docs/09 §3.4 guarantee)
    }
  }
  if (!resolved) {
    const baseline = getBaselinePrompt(capability);
    if (!baseline) return Promise.reject(new Error(`no baseline prompt for ${capability}`));
    resolved = { ...baseline, source: 'code' };
  }

  cache.set(key, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
  return resolved;
}

/**
 * {{variable}} substitution (docs/09 §3.6). Every declared variable must be
 * supplied; unknown placeholders are left intact (they indicate a template bug
 * and surface in prompt-regression tests rather than leaking empty strings).
 */
export function substituteVariables(
  template: string,
  variables: Record<string, string>,
  declared: readonly string[],
): string {
  const missing = declared.filter((name) => !(name in variables));
  if (missing.length > 0) {
    throw new Error(`missing prompt variable(s): ${missing.join(', ')}`);
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in variables ? (variables[name] ?? match) : match,
  );
}

/** Stable FNV-1a hash of the assembled prompt for reproducibility (docs/09 §9.5). */
export function promptHash(assembled: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < assembled.length; i++) {
    hash ^= assembled.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
