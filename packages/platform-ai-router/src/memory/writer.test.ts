import { describe, expect, it } from 'vitest';
import { writeMemory } from './writer';
import type { MemoryStore, MemoryWriteRecord } from './types';

function store(existingId: string | null): MemoryStore & { inserted: MemoryWriteRecord[] } {
  let seq = 0;
  const s = {
    inserted: [] as MemoryWriteRecord[],
    match: () => Promise.resolve([]),
    annotationsFor: () => Promise.resolve([]),
    findMemoryIdByHash: () => Promise.resolve(existingId),
    insert: (record: MemoryWriteRecord) => {
      s.inserted.push(record);
      return Promise.resolve(`mem-${seq++}`);
    },
    deleteStaleChunks: () => Promise.resolve(0),
  };
  return s;
}

const base = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  scope: 'contact' as const,
  subjectId: 'c1',
  content: 'Prospect prefers async email over calls.',
  embedding: [0.1, 0.2, 0.3],
  metadata: { capability: 'draft-outreach-email' },
};

describe('writeMemory dedup (docs/09 §4.6)', () => {
  it('inserts when no identical content_hash exists (returns the new id)', async () => {
    const s = store(null);
    const result = await writeMemory(s, base);
    expect(result.written).toBe(true);
    expect(result.memoryId).toBe('mem-0');
    expect(s.inserted).toHaveLength(1);
    expect(s.inserted[0]!.contentHash).toBe(result.contentHash);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/); // sha-256
  });

  it('skips the insert but returns the existing id when a match exists', async () => {
    const s = store('existing-id');
    const result = await writeMemory(s, base);
    expect(result.written).toBe(false);
    expect(result.memoryId).toBe('existing-id');
    expect(s.inserted).toHaveLength(0);
  });

  it('derives the same hash for identical (scope, subject, content)', async () => {
    const s1 = store(null);
    const s2 = store(null);
    const a = await writeMemory(s1, base);
    const b = await writeMemory(s2, base);
    expect(a.contentHash).toBe(b.contentHash);
  });
});
