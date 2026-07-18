import { describe, expect, it } from 'vitest';
import type { MemoryScope } from '../types';
import { withMemory } from './with-memory';
import type { MemoryAnnotation, MemoryHit, MemoryStore } from './types';

function hit(id: string, similarity: number, over: Partial<MemoryHit> = {}): MemoryHit {
  return {
    id,
    scope: 'contact',
    subjectId: 'c1',
    content: `content ${id}`,
    metadata: {},
    similarity,
    agentId: null,
    ...over,
  };
}

function store(
  hits: MemoryHit[],
  annotations: MemoryAnnotation[] = [],
): MemoryStore & {
  matchCalls: number;
} {
  const s = {
    matchCalls: 0,
    match: () => {
      s.matchCalls += 1;
      return Promise.resolve(hits);
    },
    annotationsFor: () => Promise.resolve(annotations),
    findMemoryIdByHash: () => Promise.resolve(null),
    insert: () => Promise.resolve('mem-id'),
    deleteStaleChunks: () => Promise.resolve(0),
  };
  return s;
}

const WS = '11111111-1111-4111-8111-111111111111';
const baseReq = {
  workspaceId: WS,
  scopes: ['contact'] as MemoryScope[],
  queryEmbedding: [0.1, 0.2],
  topK: 2,
};

describe('withMemory (docs/09 §4)', () => {
  it('returns [] without hitting the store when scopes empty or topK 0', async () => {
    const s = store([hit('a', 0.9)]);
    expect(await withMemory(s, { ...baseReq, scopes: [] })).toEqual([]);
    expect(await withMemory(s, { ...baseReq, topK: 0 })).toEqual([]);
    expect(s.matchCalls).toBe(0);
  });

  it('ranks by similarity and truncates to topK', async () => {
    const s = store([hit('a', 0.7), hit('b', 0.9), hit('c', 0.8)]);
    const result = await withMemory(s, { ...baseReq, topK: 2 });
    expect(result.map((h) => h.id)).toEqual(['b', 'c']);
  });

  it('drops never_apply memories for the capability', async () => {
    const s = store(
      [hit('a', 0.9), hit('b', 0.85)],
      [{ memoryId: 'a', annotation: 'never_apply', capability: 'draft-outreach-email' }],
    );
    const result = await withMemory(s, { ...baseReq, capability: 'draft-outreach-email' });
    expect(result.map((h) => h.id)).toEqual(['b']);
  });

  it('protects always_apply memories from truncation', async () => {
    const s = store(
      [hit('a', 0.99), hit('b', 0.6), hit('c', 0.95)],
      [{ memoryId: 'b', annotation: 'always_apply', capability: null }],
    );
    const result = await withMemory(s, { ...baseReq, topK: 2 });
    expect(result.map((h) => h.id)).toContain('b'); // kept despite lowest similarity
  });

  it('excludes ids the caller just wrote', async () => {
    const s = store([hit('a', 0.9), hit('b', 0.8)]);
    const result = await withMemory(s, { ...baseReq, excludeIds: ['a'] });
    expect(result.map((h) => h.id)).toEqual(['b']);
  });

  it('degrades to [] on store failure (cold-start, never throws)', async () => {
    const failing: MemoryStore = {
      match: () => Promise.reject(new Error('db down')),
      annotationsFor: () => Promise.resolve([]),
      findMemoryIdByHash: () => Promise.resolve(null),
      insert: () => Promise.resolve('mem-id'),
      deleteStaleChunks: () => Promise.resolve(0),
    };
    expect(await withMemory(failing, baseReq)).toEqual([]);
  });
});
