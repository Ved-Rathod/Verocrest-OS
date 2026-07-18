import { EMBEDDING_DIMENSIONS, type EmbedResult, type EmbeddingProvider } from './embeddings-types';

/**
 * Deterministic mock embedder (docs/09 testing / Sprint 3.4 decision D2). Same
 * text always maps to the same unit-normalized 1536-d vector, so cosine
 * similarity is meaningful in tests and offline dev — identical content scores
 * 1.0, unrelated content scores near 0. Keyless: the Router selects this when no
 * OPENAI_API_KEY is set, so local development needs no AI keys.
 */

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** FNV-1a → deterministic per-dimension seed. */
function seededVector(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS);
  let sumSquares = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    let hash = 0x811c9dc5 ^ i;
    for (let c = 0; c < text.length; c++) {
      hash ^= text.charCodeAt(c);
      hash = Math.imul(hash, 0x01000193);
    }
    // Map the 32-bit hash into [-1, 1).
    const value = ((hash >>> 0) / 0xffffffff) * 2 - 1;
    vector[i] = value;
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares) || 1;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) vector[i] = vector[i]! / norm;
  return vector;
}

export function createMockEmbeddingProvider(): EmbeddingProvider {
  return {
    name: 'mock',
    model: 'mock-embedding',
    embed(texts: string[]): Promise<EmbedResult> {
      return Promise.resolve({
        vectors: texts.map(seededVector),
        inputTokens: texts.reduce((sum, t) => sum + estimateTokens(t), 0),
      });
    },
  };
}
