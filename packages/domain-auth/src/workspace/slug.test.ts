import { describe, expect, it } from 'vitest';
import { defaultWorkspaceName, generateWorkspaceSlug, slugify } from './slug';

const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

describe('slugify', () => {
  it('lowercases and dashes non-alphanumerics', () => {
    expect(slugify('Véd Rathod & Co.')).toBe('ved-rathod-co');
  });

  it('trims leading/trailing dashes and caps length', () => {
    const out = slugify('---A very long workspace name that keeps going forever---');
    expect(out.length).toBeLessThanOrEqual(24);
    expect(out.startsWith('-')).toBe(false);
    expect(out.endsWith('-')).toBe(false);
  });

  it('falls back for degenerate input', () => {
    expect(slugify('@@@')).toBe('workspace');
    expect(slugify('')).toBe('workspace');
  });
});

describe('generateWorkspaceSlug', () => {
  it('matches the provision function format contract', () => {
    for (const label of ['founder', 'Sarah Chen', 'a', '日本語']) {
      expect(generateWorkspaceSlug(label)).toMatch(SLUG_FORMAT);
    }
  });

  it('produces distinct suffixes across calls', () => {
    const a = generateWorkspaceSlug('founder');
    const b = generateWorkspaceSlug('founder');
    expect(a).not.toBe(b);
  });
});

describe('defaultWorkspaceName', () => {
  it('prefers the display name first word', () => {
    expect(defaultWorkspaceName('Ved Rathod', 'x@y.co')).toBe("Ved's Workspace");
  });

  it('falls back to the email local part', () => {
    expect(defaultWorkspaceName(null, 'founder@verocrest.app')).toBe("founder's Workspace");
  });

  it('falls back to a generic name', () => {
    expect(defaultWorkspaceName(null, null)).toBe('My Workspace');
  });

  it('never exceeds the 60-char workspace name limit', () => {
    expect(defaultWorkspaceName('X'.repeat(100), null).length).toBeLessThanOrEqual(60);
  });
});
