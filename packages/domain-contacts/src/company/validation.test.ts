import { describe, expect, it } from 'vitest';
import {
  companyInputSchema,
  companyListParamsSchema,
  parseTags,
  toFieldErrors,
} from './validation';

describe('companyInputSchema', () => {
  it('accepts a minimal valid company', () => {
    const parsed = companyInputSchema.parse({ name: 'Acme' });
    expect(parsed.name).toBe('Acme');
    expect(parsed.isClient).toBe(false);
    expect(parsed.tags).toEqual([]);
  });

  it('trims and requires a name (docs/04 §4.5 length constraint)', () => {
    expect(companyInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(companyInputSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
  });

  it('normalizes empty optionals to undefined', () => {
    const parsed = companyInputSchema.parse({ name: 'Acme', domain: '', industry: '  ' });
    expect(parsed.domain).toBeUndefined();
    expect(parsed.industry).toBeUndefined();
  });

  it('coerces the checkbox and employee count', () => {
    const parsed = companyInputSchema.parse({ name: 'Acme', isClient: 'on', employeeCount: '42' });
    expect(parsed.isClient).toBe(true);
    expect(parsed.employeeCount).toBe(42);
  });

  it('rejects an invalid website url and negative employee count', () => {
    expect(companyInputSchema.safeParse({ name: 'A', websiteUrl: 'not-a-url' }).success).toBe(
      false,
    );
    expect(companyInputSchema.safeParse({ name: 'A', employeeCount: '-3' }).success).toBe(false);
  });

  it('rejects an unknown size and unknown keys', () => {
    expect(companyInputSchema.safeParse({ name: 'A', size: 'gigantic' }).success).toBe(false);
    expect(companyInputSchema.safeParse({ name: 'A', secret: 1 }).success).toBe(false);
  });

  it('produces named field errors', () => {
    const r = companyInputSchema.safeParse({ name: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(toFieldErrors(r.error)).toHaveProperty('name');
  });
});

describe('parseTags', () => {
  it('splits, trims, dedupes, and caps', () => {
    expect(parseTags('dental,  vip , dental\nau')).toEqual(['dental', 'vip', 'au']);
  });
  it('returns empty for non-strings', () => {
    expect(parseTags(null)).toEqual([]);
  });
});

describe('companyListParamsSchema', () => {
  it('defaults sensibly', () => {
    const p = companyListParamsSchema.parse({});
    expect(p.isClient).toBe('all');
    expect(p.pageSize).toBe(50);
  });
  it('caps pageSize at 200 (docs/10 §12.3)', () => {
    expect(companyListParamsSchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });
});
