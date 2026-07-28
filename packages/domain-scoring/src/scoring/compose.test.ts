import { describe, expect, it } from 'vitest';
import { composeFit, composeOpportunity, type FitInput } from './compose';

const comp = (
  key: FitInput['key'],
  available: boolean,
  rawScore: number | null,
  baseWeight: number,
): FitInput => ({ key, label: key, available, rawScore, baseWeight, note: '' });

describe('composeFit', () => {
  it('renormalizes weights over available components (missing enrichment does not bias)', () => {
    // ICP 80 (w .6), website 60 (w .2), enrichment absent (w .2).
    // Renormalized over {icp,website}: .75/.25 → 0.75*80 + 0.25*60 = 75.
    const { fitScore, components } = composeFit([
      comp('icp', true, 80, 0.6),
      comp('website', true, 60, 0.2),
      comp('enrichment', false, null, 0.2),
    ]);
    expect(fitScore).toBe(75);
    expect(components.find((c) => c.key === 'enrichment')?.effectiveWeight).toBe(0);
    expect(components.find((c) => c.key === 'icp')?.effectiveWeight).toBeCloseTo(0.75, 5);
  });

  it('a single available component becomes the whole score', () => {
    const { fitScore } = composeFit([
      comp('icp', true, 42, 0.6),
      comp('website', false, null, 0.2),
      comp('enrichment', false, null, 0.2),
    ]);
    expect(fitScore).toBe(42);
  });

  it('returns null when nothing is available (never fabricates a fit)', () => {
    const { fitScore } = composeFit([
      comp('icp', false, null, 0.6),
      comp('website', false, null, 0.2),
      comp('enrichment', false, null, 0.2),
    ]);
    expect(fitScore).toBeNull();
  });
});

describe('composeOpportunity', () => {
  it('is null while readiness is unavailable (never neutral-filled)', () => {
    expect(composeOpportunity(80, null)).toBeNull();
  });

  it('computes sqrt(fit*readiness) once readiness genuinely exists', () => {
    expect(composeOpportunity(80, 45)).toBe(60); // round(sqrt(3600)) = 60
  });
});
