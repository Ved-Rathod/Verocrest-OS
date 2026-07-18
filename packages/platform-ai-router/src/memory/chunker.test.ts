import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker';

describe('chunkText (docs/09 §5.2)', () => {
  it('returns nothing for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('keeps a short document as a single chunk', () => {
    const chunks = chunkText('A short knowledge note about our onboarding SOP.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[0]!.charStart).toBe(0);
  });

  it('splits a long document into overlapping, ordered chunks', () => {
    const sentence = 'This is a sentence about agency client acquisition workflows. ';
    const doc = sentence.repeat(120); // ~7k chars, well over one chunk
    const chunks = chunkText(doc);
    expect(chunks.length).toBeGreaterThan(1);
    // Monotonic indices and forward progress.
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.charStart).toBeGreaterThan(chunks[i - 1]!.charStart);
    }
    // Overlap: each chunk (after the first) starts before the previous ended.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.charStart).toBeLessThan(chunks[i - 1]!.charEnd);
    }
    // Full coverage: last chunk reaches the end.
    expect(chunks.at(-1)!.charEnd).toBe(doc.trim().length);
  });

  it('prefers sentence boundaries', () => {
    const a = 'Alpha. '.repeat(200); // ~1400 chars
    const chunks = chunkText(a);
    // Every chunk should end at a sentence terminator (or the doc end).
    for (const c of chunks) {
      expect(/[.!?]$/.test(c.content) || c.charEnd === a.trim().length).toBe(true);
    }
  });
});
