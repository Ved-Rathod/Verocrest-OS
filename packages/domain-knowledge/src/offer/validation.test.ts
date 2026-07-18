import { describe, expect, it } from 'vitest';
import { offerContentHash } from './hash';
import { offerInputSchema, slugify, type OfferInput } from './validation';

function base(over: Partial<OfferInput> = {}): unknown {
  return { name: 'Website Audit Sprint', pricingModel: 'fixed', ...over };
}

describe('offerInputSchema', () => {
  it('accepts a minimal offer and applies defaults', () => {
    const r = offerInputSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.deliverables).toEqual([]);
      expect(r.data.guarantees).toEqual([]);
      expect(r.data.requirements).toEqual([]);
      expect(r.data.pricingModel).toBe('fixed');
    }
  });

  it('requires a name', () => {
    expect(offerInputSchema.safeParse(base({ name: '' })).success).toBe(false);
  });

  it('validates structured deliverables + guarantees', () => {
    const r = offerInputSchema.safeParse(
      base({
        deliverables: [
          { title: 'Audit report', description: 'Full site audit', quantity: 1, timelineDays: 7 },
        ],
        guarantees: [{ type: 'money_back', description: '30-day', conditions: 'if unsatisfied' }],
      }),
    );
    expect(r.success).toBe(true);
  });

  it('rejects a deliverable with no title', () => {
    const r = offerInputSchema.safeParse(
      base({ deliverables: [{ title: '' }] as OfferInput['deliverables'] }),
    );
    expect(r.success).toBe(false);
  });

  it('rejects an unknown pricing model', () => {
    const r = offerInputSchema.safeParse({ ...(base() as object), pricingModel: 'freemium' });
    expect(r.success).toBe(false);
  });

  it('requires currency when a price is set, and rejects max < price', () => {
    expect(offerInputSchema.safeParse(base({ price: 5000 })).success).toBe(false);
    expect(
      offerInputSchema.safeParse(base({ price: 5000, priceMax: 1000, currency: 'USD' })).success,
    ).toBe(false);
  });
});

describe('slugify', () => {
  it('produces url-safe slugs', () => {
    expect(slugify('Website Audit Sprint!')).toBe('website-audit-sprint');
    expect(slugify('  A/B  Test ')).toBe('a-b-test');
    expect(slugify('')).toBe('offer');
  });
});

describe('offerContentHash (docs/04 §10.6/§10.7)', () => {
  it('changes only when indexed fields change (positioning/roi/deliverables/guarantees)', () => {
    const a = offerInputSchema.parse(base({ positioning: 'Fast audits' }));
    const b = offerInputSchema.parse(
      base({ positioning: 'Fast audits', price: 9999, currency: 'USD' }),
    );
    const c = offerInputSchema.parse(base({ positioning: 'Different positioning' }));
    // Pricing change does NOT alter the indexed-content hash.
    expect(offerContentHash(a)).toBe(offerContentHash(b));
    // Positioning change DOES.
    expect(offerContentHash(a)).not.toBe(offerContentHash(c));
    expect(offerContentHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
