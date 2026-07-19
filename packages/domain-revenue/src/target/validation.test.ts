import { describe, expect, it } from 'vitest';
import { targetInputSchema, type TargetInput } from './validation';
import { targetContentHash } from './hash';
import { isCurrent, toTarget, targetRowSchema } from './types';

function base(over: Partial<Record<keyof TargetInput, unknown>> = {}): unknown {
  return {
    period: 'monthly',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    revenueTarget: 50000,
    currency: 'usd',
    ...over,
  };
}

describe('targetInputSchema (docs/04 §13.2)', () => {
  it('accepts a valid target and upper-cases currency', () => {
    const r = targetInputSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.currency).toBe('USD');
  });

  it('rejects a negative target amount', () => {
    expect(targetInputSchema.safeParse(base({ revenueTarget: -1 })).success).toBe(false);
  });

  it('rejects an unknown period', () => {
    expect(targetInputSchema.safeParse(base({ period: 'weekly' })).success).toBe(false);
  });

  it('requires a 3-letter ISO currency', () => {
    expect(targetInputSchema.safeParse(base({ currency: 'US' })).success).toBe(false);
    expect(targetInputSchema.safeParse(base({ currency: 'dollars' })).success).toBe(false);
  });

  it('requires end date after start date', () => {
    expect(targetInputSchema.safeParse(base({ periodEnd: '2026-07-01' })).success).toBe(false);
    expect(targetInputSchema.safeParse(base({ periodEnd: '2026-06-01' })).success).toBe(false);
  });

  it('rejects malformed dates', () => {
    expect(targetInputSchema.safeParse(base({ periodStart: '07/01/2026' })).success).toBe(false);
  });

  it('rejects a negative meetings target', () => {
    expect(targetInputSchema.safeParse(base({ meetingsTarget: -3 })).success).toBe(false);
  });
});

describe('targetContentHash', () => {
  const input = targetInputSchema.parse(base());
  it('is stable and changes iff an indexed field changes', () => {
    expect(targetContentHash(input)).toBe(targetContentHash(input));
    expect(targetContentHash(input)).not.toBe(
      targetContentHash(targetInputSchema.parse(base({ revenueTarget: 60000 }))),
    );
    expect(targetContentHash(input)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('ignores non-indexed fields (meetings/reply)', () => {
    expect(targetContentHash(input)).toBe(
      targetContentHash(targetInputSchema.parse(base({ meetingsTarget: 10 }))),
    );
  });
});

describe('isCurrent / toTarget', () => {
  it('detects whether today is within the target period', () => {
    const t = { periodStart: '2026-07-01', periodEnd: '2026-07-31' };
    expect(isCurrent(t, new Date('2026-07-15T00:00:00Z'))).toBe(true);
    expect(isCurrent(t, new Date('2026-08-01T00:00:00Z'))).toBe(false);
  });

  it('maps a DB row (numeric-as-string) to a Target', () => {
    const target = toTarget(
      targetRowSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        period: 'monthly',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
        revenue_target: '50000.0000',
        currency: 'USD',
        meetings_target: null,
        reply_rate_target: '12.50',
        is_indexed: true,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      }),
    );
    expect(target.revenueTarget).toBe(50000);
    expect(target.replyRateTarget).toBe(12.5);
    expect(target.isIndexed).toBe(true);
  });
});
