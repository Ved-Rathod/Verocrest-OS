import type { IndexedChunk } from './types';

/**
 * knowledge_document_chunks maintenance (docs/04 §7.4–7.5, Sprint 4.3). Tracks
 * the chunk↔memory-vector mapping (char offsets + version) so re-indexing swaps
 * the prior version precisely. Pure orchestration over an injectable store —
 * unit-testable without a DB (the Supabase impl lives in supabase-memory-store).
 */

export type KnowledgeChunkRecord = {
  workspaceId: string;
  knowledgeDocumentId: string;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
  memoryVectorId: string | null;
  contentHash: string; // the DOC's content_hash — shared by all chunks of a version
  docVersionAtIndex: number;
};

export interface KnowledgeChunkStore {
  /** Upsert chunk rows for a document (conflict on (doc_id, chunk_index)). */
  upsertChunks(records: KnowledgeChunkRecord[]): Promise<void>;
  /** Delete this document's chunk rows whose content_hash != keep (prior versions). */
  deleteChunksWhereHashNot(params: {
    workspaceId: string;
    knowledgeDocumentId: string;
    keepContentHash: string;
  }): Promise<number>;
}

/**
 * Two-phase swap for a document's chunk tracking (docs/04 §7.5 step 3–4): upsert
 * the current version's chunk rows (linked to their memory vectors), THEN delete
 * any rows from a prior content_hash. Returns counts for the caller/tests.
 * Idempotent: an unchanged re-index upserts the same rows and deletes nothing.
 */
export async function syncKnowledgeChunks(
  store: KnowledgeChunkStore,
  params: {
    workspaceId: string;
    knowledgeDocumentId: string;
    docContentHash: string;
    docVersion: number;
    chunks: IndexedChunk[];
  },
): Promise<{ upserted: number; deletedStale: number }> {
  const records: KnowledgeChunkRecord[] = params.chunks.map((c) => ({
    workspaceId: params.workspaceId,
    knowledgeDocumentId: params.knowledgeDocumentId,
    chunkIndex: c.chunkIndex,
    content: c.content,
    charStart: c.charStart,
    charEnd: c.charEnd,
    memoryVectorId: c.memoryVectorId,
    contentHash: params.docContentHash,
    docVersionAtIndex: params.docVersion,
  }));

  if (records.length > 0) await store.upsertChunks(records);

  const deletedStale = await store.deleteChunksWhereHashNot({
    workspaceId: params.workspaceId,
    knowledgeDocumentId: params.knowledgeDocumentId,
    keepContentHash: params.docContentHash,
  });

  return { upserted: records.length, deletedStale };
}
