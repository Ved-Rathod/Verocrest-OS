import type { MemoryScope } from '../types';

/** withMemory request (docs/09 §4.2). Retrieval operates on a precomputed
 *  query embedding — the Router owns query embedding (cost-logged) and passes
 *  the vector in, so this layer is pure retrieval + annotation. */
export type MemoryRequest = {
  workspaceId: string;
  scopes: MemoryScope[];
  queryEmbedding: number[];
  subjectIds?: string[];
  topK: number;
  minSimilarity?: number;
  excludeIds?: string[];
  capability?: string; // for annotation targeting (docs/09 §4.5)
};

export type MemoryHit = {
  id: string;
  scope: MemoryScope;
  subjectId: string | null;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  agentId: string | null;
};

/** Per-chunk record returned by indexEntityIntoMemory, consumed by chunk-tracking (Sprint 4.3). */
export type IndexedChunk = {
  chunkIndex: number;
  charStart: number;
  charEnd: number;
  content: string;
  contentHash: string;
  memoryVectorId: string | null;
};

/** A row to persist (docs/09 §4.6 fire-and-forget write). */
export type MemoryWriteRecord = {
  workspaceId: string;
  scope: MemoryScope;
  subjectId: string | null;
  content: string;
  contentHash: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  ttlAt?: string | null;
  createdBy?: string | null;
};

/** annotation rows for a set of memories (docs/04 §7.2). */
export type MemoryAnnotation = {
  memoryId: string;
  annotation: 'always_apply' | 'never_apply' | 'boost' | 'suppress';
  capability: string | null;
};

/**
 * Persistence port (hexagonal seam). Supabase impl in supabase-memory-store.ts;
 * in-memory fakes in tests. All reads/writes are workspace-scoped.
 */
export interface MemoryStore {
  /** RLS-scoped cosine ANN search (match_memory RPC). Oversampled server-side. */
  match(params: {
    workspaceId: string;
    scopes: MemoryScope[];
    subjectIds: string[] | null;
    queryEmbedding: number[];
    topK: number;
    minSimilarity: number;
  }): Promise<MemoryHit[]>;

  /** Annotations for the given memory ids (docs/09 §4.5). */
  annotationsFor(workspaceId: string, memoryIds: string[]): Promise<MemoryAnnotation[]>;

  /**
   * The id of an existing identical (scope, subject, content_hash) row, or null
   * (dedup). Returns the id — not just a boolean — so chunk-tracking can link to
   * the surviving vector on an unchanged re-index (Sprint 4.3).
   */
  findMemoryIdByHash(params: {
    workspaceId: string;
    scope: MemoryScope;
    subjectId: string | null;
    contentHash: string;
  }): Promise<string | null>;

  /** Insert a memory vector row; returns its id. */
  insert(record: MemoryWriteRecord): Promise<string>;

  /**
   * Two-phase-swap cleanup (docs/09 §5.4): after new chunks for a re-indexed
   * entity are durably inserted, delete the entity's rows carrying a DIFFERENT
   * `source_content_hash` (the prior version). No-op when the hash is unchanged.
   * Service-role only (re-index deletes; docs/03 §12).
   */
  deleteStaleChunks(params: {
    workspaceId: string;
    scope: MemoryScope;
    subjectId: string;
    keepSourceContentHash: string;
  }): Promise<number>;
}
