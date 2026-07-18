import { describe, expect, it } from 'vitest';
import {
  MODEL_PRICING,
  actualCostUsd,
  estimateCostUsd,
  estimateTokens,
  getModelPricing,
} from './pricing';

describe('pricing', () => {
  it('resolves models per provider and misses unknown ones', () => {
    expect(getModelPricing('anthropic', 'claude-sonnet-5')?.outputPricePerMillion).toBe(15);
    expect(getModelPricing('mock', 'mock-model')?.inputPricePerMillion).toBe(0);
    expect(getModelPricing('anthropic', 'not-a-model')).toBeNull();
  });

  it('computes estimated cost = input + full output budget (docs/09 §6.3)', () => {
    const sonnet = getModelPricing('anthropic', 'claude-sonnet-5')!;
    // 1M input tokens at $3 + 1M output budget at $15
    expect(estimateCostUsd(sonnet, 1_000_000, 1_000_000)).toBeCloseTo(18);
    expect(estimateCostUsd(sonnet, 1000, 1024)).toBeCloseTo((1000 * 3 + 1024 * 15) / 1_000_000, 8);
  });

  it('prices the mock model at exactly zero', () => {
    const mock = getModelPricing('mock', 'mock-model')!;
    expect(actualCostUsd(mock, 123_456, 654_321)).toBe(0);
  });

  it('estimates ~4 chars per token with a floor of 1', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('abcd'.repeat(100))).toBe(100);
  });

  it('every pricing row carries an effective date (monthly review contract)', () => {
    for (const row of MODEL_PRICING) {
      expect(row.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
