import { describe, expect, it } from 'vitest';
import { icpContentHash } from './hash';
import { buildCriteria, icpInputSchema, type IcpInput } from './validation';

function base(over: Partial<IcpInput> = {}): unknown {
  return {
    name: 'Dental clinics',
    narrative: 'Owner-operated dental clinics with 2-5 practitioners.',
    targetIndustries: ['dental'],
    targetGeographies: ['AU'],
    targetSize: ['small'],
    disqualifiers: [],
    ...over,
  };
}

describe('icpInputSchema', () => {
  it('accepts a valid ICP', () => {
    const r = icpInputSchema.safeParse(base());
    expect(r.success).toBe(true);
  });

  it('requires name and narrative', () => {
    expect(icpInputSchema.safeParse(base({ name: '' })).success).toBe(false);
    expect(icpInputSchema.safeParse(base({ narrative: '' })).success).toBe(false);
  });

  it('rejects a non-2-char geography code', () => {
    const r = icpInputSchema.safeParse(base({ targetGeographies: ['AUS'] }));
    expect(r.success).toBe(false);
  });

  it('rejects an unknown company size', () => {
    const r = icpInputSchema.safeParse({ ...(base() as object), targetSize: ['gigantic'] });
    expect(r.success).toBe(false);
  });

  it('requires currency when a revenue range is set', () => {
    const r = icpInputSchema.safeParse(base({ targetRevenueMin: 500000 }));
    expect(r.success).toBe(false);
  });

  it('rejects max revenue below min', () => {
    const r = icpInputSchema.safeParse(
      base({ targetRevenueMin: 1000, targetRevenueMax: 500, targetRevenueCurrency: 'USD' }),
    );
    expect(r.success).toBe(false);
  });

  it('uppercases the currency', () => {
    const r = icpInputSchema.safeParse(
      base({ targetRevenueMin: 1000, targetRevenueCurrency: 'usd' }),
    );
    expect(r.success && r.data.targetRevenueCurrency).toBe('USD');
  });
});

describe('buildCriteria (docs/04 §5.8)', () => {
  it('derives the §5.8 shape from targeting fields', () => {
    const input = icpInputSchema.parse(
      base({ targetIndustries: ['dental', 'orthodontics'], targetSize: ['small', 'medium'] }),
    );
    const criteria = buildCriteria(input) as { company: Record<string, unknown> };
    expect(criteria.company['industries']).toEqual({ must_match_one: ['dental', 'orthodontics'] });
    expect(criteria.company['size']).toEqual({ in: ['small', 'medium'] });
    expect(criteria.company['geographies']).toEqual({ in: ['AU'] });
    expect(criteria.company['signals']).toEqual([]);
  });
});

describe('icpContentHash', () => {
  it('is stable for identical content and changes with the narrative', () => {
    const input = icpInputSchema.parse(base());
    const criteria = buildCriteria(input);
    const h1 = icpContentHash(input.narrative, criteria);
    const h2 = icpContentHash(input.narrative, criteria);
    const h3 = icpContentHash('a different narrative', criteria);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});
