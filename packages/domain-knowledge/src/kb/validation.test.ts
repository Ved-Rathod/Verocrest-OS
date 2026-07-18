import { describe, expect, it } from 'vitest';
import { knowledgeDocContentHash } from './hash';
import { knowledgeDocInputSchema, type KnowledgeDocInput } from './validation';

function base(over: Partial<KnowledgeDocInput> = {}): unknown {
  return {
    docType: 'case_study',
    title: 'Acme 3x ROI',
    content: '# Acme\nGreat results.',
    ...over,
  };
}

describe('knowledgeDocInputSchema', () => {
  it('accepts a valid doc and defaults tags/visibility', () => {
    const r = knowledgeDocInputSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tags).toEqual([]);
      expect(r.data.visibility).toBe('internal');
    }
  });

  it('requires title and content', () => {
    expect(knowledgeDocInputSchema.safeParse(base({ title: '' })).success).toBe(false);
    expect(knowledgeDocInputSchema.safeParse(base({ content: '' })).success).toBe(false);
  });

  it('rejects an unknown doc type', () => {
    expect(
      knowledgeDocInputSchema.safeParse({ ...(base() as object), docType: 'memo' }).success,
    ).toBe(false);
  });

  it('requires a linked id when a linked type is set (and vice versa)', () => {
    expect(knowledgeDocInputSchema.safeParse(base({ linkedEntityType: 'offer' })).success).toBe(
      false,
    );
    expect(
      knowledgeDocInputSchema.safeParse(
        base({ linkedEntityId: '22222222-2222-4222-8222-222222222222' }),
      ).success,
    ).toBe(false);
  });

  it('accepts a complete linked entity', () => {
    const r = knowledgeDocInputSchema.safeParse(
      base({ linkedEntityType: 'offer', linkedEntityId: '22222222-2222-4222-8222-222222222222' }),
    );
    expect(r.success).toBe(true);
  });
});

describe('knowledgeDocContentHash (docs/04 §7.3)', () => {
  it('changes iff content changes', () => {
    const a = knowledgeDocContentHash('# Acme\nGreat results.');
    const b = knowledgeDocContentHash('# Acme\nGreat results.');
    const c = knowledgeDocContentHash('# Acme\nEven better results.');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
