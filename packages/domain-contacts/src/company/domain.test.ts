import { describe, expect, it } from 'vitest';
import { normalizeDomain } from './domain';

describe('normalizeDomain', () => {
  it('extracts a bare host from a full URL', () => {
    expect(normalizeDomain('https://www.acme.com/about?x=1')).toBe('acme.com');
  });

  it('strips leading www and lowercases', () => {
    expect(normalizeDomain('WWW.Acme.COM')).toBe('acme.com');
  });

  it('accepts a bare host', () => {
    expect(normalizeDomain('acme.com')).toBe('acme.com');
    expect(normalizeDomain('sub.acme.co.uk')).toBe('sub.acme.co.uk');
  });

  it('handles a host with a path but no scheme', () => {
    expect(normalizeDomain('acme.com/contact')).toBe('acme.com');
  });

  it('returns null for empty or nullish input', () => {
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('   ')).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
  });

  it('rejects non-domain tokens', () => {
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('localhost')).toBeNull();
    expect(normalizeDomain('acme')).toBeNull();
  });

  it('normalizes so two forms of the same site dedupe equal', () => {
    expect(normalizeDomain('https://www.acme.com')).toBe(normalizeDomain('acme.com/'));
  });
});
