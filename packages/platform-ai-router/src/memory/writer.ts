import type { MemoryScope } from '../types';
import { memoryContentHash } from './hash';
import type { MemoryStore, MemoryWriteRecord } from './types';

/**
 * Content-hash-deduped memory write (docs/09 §4.6). Given an already-computed
 * embedding, skip if an identical (scope, subject, content_hash) row exists,
 * else insert. Returns whether a row was written. Non-throwing at the dedup
 * check — a failed existence probe proceeds to insert (at-least-once, the ANN
 * index tolerates a rare duplicate).
 */
export async function writeMemory(
  store: MemoryStore,
  params: {
    workspaceId: string;
    scope: MemoryScope;
    subjectId: string | null;
    content: string;
    embedding: number[];
    metadata: Record<string, unknown>;
    ttlAt?: string | null;
    createdBy?: string | null;
  },
): Promise<{ written: boolean; contentHash: string; memoryId: string | null }> {
  const contentHash = memoryContentHash(params.scope, params.subjectId, params.content);

  let existingId: string | null = null;
  try {
    existingId = await store.findMemoryIdByHash({
      workspaceId: params.workspaceId,
      scope: params.scope,
      subjectId: params.subjectId,
      contentHash,
    });
  } catch (err) {
    console.error('[memory] dedup probe failed; inserting anyway', err);
  }
  if (existingId) return { written: false, contentHash, memoryId: existingId };

  const record: MemoryWriteRecord = {
    workspaceId: params.workspaceId,
    scope: params.scope,
    subjectId: params.subjectId,
    content: params.content,
    contentHash,
    embedding: params.embedding,
    metadata: params.metadata,
    ttlAt: params.ttlAt ?? null,
    createdBy: params.createdBy ?? null,
  };
  const memoryId = await store.insert(record);
  return { written: true, contentHash, memoryId };
}
