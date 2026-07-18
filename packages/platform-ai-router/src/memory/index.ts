// Memory substrate (docs/09 §4–5), internal to the Router package so the
// platform layer never depends on a domain package. Pure/testable core; the
// Supabase-backed stores are server-only.
export { chunkText, type Chunk } from './chunker';
export {
  getCachedQueryEmbedding,
  setCachedQueryEmbedding,
  resetQueryEmbeddingCacheForTests,
} from './cache';
export { memoryContentHash, queryHash } from './hash';
export { MEMORY_POLICY, assertScopesAllowed, getMemoryPolicy, type MemoryPolicy } from './scopes';
export { withMemory } from './with-memory';
export { writeMemory } from './writer';
export type {
  MemoryAnnotation,
  MemoryHit,
  MemoryRequest,
  MemoryStore,
  MemoryWriteRecord,
} from './types';
