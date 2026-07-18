import { describe, expect, it } from 'vitest';
import { createMockEmbeddingProvider } from './mock-embeddings';
import { EMBEDDING_DIMENSIONS } from './embeddings-types';

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot; // both are unit-normalized
}

describe('mock embedding provider', () => {
  it('produces 1536-d unit vectors, one per input', async () => {
    const embedder = createMockEmbeddingProvider();
    const { vectors, inputTokens } = await embedder.embed(['hello world', 'another input']);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(vectors[0]!.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(inputTokens).toBeGreaterThan(0);
  });

  it('is deterministic: identical text → identical vector (cosine 1.0)', async () => {
    const embedder = createMockEmbeddingProvider();
    const [a] = (await embedder.embed(['the quick brown fox'])).vectors;
    const [b] = (await embedder.embed(['the quick brown fox'])).vectors;
    expect(cosine(a!, b!)).toBeCloseTo(1, 6);
  });

  it('separates unrelated text (cosine well below 1)', async () => {
    const embedder = createMockEmbeddingProvider();
    const [a] = (await embedder.embed(['agency onboarding sop'])).vectors;
    const [b] = (await embedder.embed(['completely different subject matter xyz'])).vectors;
    expect(cosine(a!, b!)).toBeLessThan(0.5);
  });
});
