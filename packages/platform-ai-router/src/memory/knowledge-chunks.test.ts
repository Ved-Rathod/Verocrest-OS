import { describe, expect, it } from 'vitest';
import {
  syncKnowledgeChunks,
  type KnowledgeChunkRecord,
  type KnowledgeChunkStore,
} from './knowledge-chunks';
import type { IndexedChunk } from './types';

const WS = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';

/** In-memory KnowledgeChunkStore with real upsert (by doc+chunk_index) + hash-swap. */
function fakeStore(): KnowledgeChunkStore & { rows: KnowledgeChunkRecord[] } {
  const rows: KnowledgeChunkRecord[] = [];
  return {
    rows,
    upsertChunks(records: KnowledgeChunkRecord[]): Promise<void> {
      for (const r of records) {
        const i = rows.findIndex(
          (x) => x.knowledgeDocumentId === r.knowledgeDocumentId && x.chunkIndex === r.chunkIndex,
        );
        if (i >= 0) rows[i] = r;
        else rows.push(r);
      }
      return Promise.resolve();
    },
    deleteChunksWhereHashNot(params): Promise<number> {
      let removed = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const x = rows[i]!;
        if (
          x.workspaceId === params.workspaceId &&
          x.knowledgeDocumentId === params.knowledgeDocumentId &&
          x.contentHash !== params.keepContentHash
        ) {
          rows.splice(i, 1);
          removed++;
        }
      }
      return Promise.resolve(removed);
    },
  };
}

function chunk(i: number, memoryVectorId: string | null): IndexedChunk {
  return {
    chunkIndex: i,
    charStart: i * 100,
    charEnd: i * 100 + 90,
    content: `chunk ${i} content`,
    contentHash: `per-chunk-${i}`,
    memoryVectorId,
  };
}

describe('syncKnowledgeChunks — two-phase swap invariants (docs/04 §7.5)', () => {
  it('records new chunks with their memory_vector_id, version, and doc content_hash', async () => {
    const store = fakeStore();
    const res = await syncKnowledgeChunks(store, {
      workspaceId: WS,
      knowledgeDocumentId: DOC,
      docContentHash: 'h1',
      docVersion: 1,
      chunks: [chunk(0, 'mv-a'), chunk(1, 'mv-b')],
    });
    expect(res.upserted).toBe(2);
    expect(store.rows).toHaveLength(2);
    // memory_vector_id correctly referenced
    expect(store.rows.map((r) => r.memoryVectorId).sort()).toEqual(['mv-a', 'mv-b']);
    // version + content_hash consistency
    expect(store.rows.every((r) => r.contentHash === 'h1' && r.docVersionAtIndex === 1)).toBe(true);
    // char offsets carried
    expect(store.rows[0]!.charStart).toBe(0);
  });

  it('re-index to fewer chunks: old chunks removed, new present, no stale mappings', async () => {
    const store = fakeStore();
    await syncKnowledgeChunks(store, {
      workspaceId: WS,
      knowledgeDocumentId: DOC,
      docContentHash: 'h1',
      docVersion: 1,
      chunks: [chunk(0, 'mv-a'), chunk(1, 'mv-b'), chunk(2, 'mv-c')],
    });
    // v2: content changed (h2), now only 2 chunks
    const res = await syncKnowledgeChunks(store, {
      workspaceId: WS,
      knowledgeDocumentId: DOC,
      docContentHash: 'h2',
      docVersion: 2,
      chunks: [chunk(0, 'mv-a2'), chunk(1, 'mv-b2')],
    });
    expect(res.deletedStale).toBe(1); // the orphaned chunk_index 2 (h1) is removed
    expect(store.rows).toHaveLength(2);
    // No stale mappings remain — every row is the current version/hash.
    expect(store.rows.every((r) => r.contentHash === 'h2' && r.docVersionAtIndex === 2)).toBe(true);
    expect(store.rows.map((r) => r.memoryVectorId).sort()).toEqual(['mv-a2', 'mv-b2']);
  });

  it('is idempotent on an unchanged re-index (no stale deletions, rows stable)', async () => {
    const store = fakeStore();
    const args = {
      workspaceId: WS,
      knowledgeDocumentId: DOC,
      docContentHash: 'h1',
      docVersion: 1,
      chunks: [chunk(0, 'mv-a'), chunk(1, 'mv-b')],
    };
    await syncKnowledgeChunks(store, args);
    const res = await syncKnowledgeChunks(store, args);
    expect(res.deletedStale).toBe(0);
    expect(store.rows).toHaveLength(2);
  });

  it('preserves a null memory_vector_id (deduped chunk with no fresh insert)', async () => {
    const store = fakeStore();
    await syncKnowledgeChunks(store, {
      workspaceId: WS,
      knowledgeDocumentId: DOC,
      docContentHash: 'h1',
      docVersion: 1,
      chunks: [chunk(0, null)],
    });
    expect(store.rows[0]!.memoryVectorId).toBeNull();
  });
});
