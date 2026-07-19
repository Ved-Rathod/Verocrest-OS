import { describe, expect, it } from 'vitest';
import { analyzeInputSchema, withScheme } from './validation';

describe('analyzeInputSchema', () => {
  it('prepends https:// to a bare host', () => {
    expect(withScheme('acme.com')).toBe('https://acme.com');
    expect(withScheme('http://acme.com')).toBe('http://acme.com');
    const r = analyzeInputSchema.safeParse({ url: 'acme.com' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.url).toBe('https://acme.com');
  });

  it('accepts http and https URLs', () => {
    expect(analyzeInputSchema.safeParse({ url: 'https://acme.com/pricing' }).success).toBe(true);
    expect(analyzeInputSchema.safeParse({ url: 'http://acme.com' }).success).toBe(true);
  });

  it('rejects empty, non-http schemes, and hostless input', () => {
    expect(analyzeInputSchema.safeParse({ url: '' }).success).toBe(false);
    expect(analyzeInputSchema.safeParse({ url: 'ftp://acme.com' }).success).toBe(false);
    expect(analyzeInputSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
    expect(analyzeInputSchema.safeParse({ url: 'notahost' }).success).toBe(false);
  });
});
