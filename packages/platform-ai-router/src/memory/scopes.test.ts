import { describe, expect, it } from 'vitest';
import { assertScopesAllowed, getMemoryPolicy } from './scopes';

describe('memory scope allow-lists (docs/09 §4.3)', () => {
  it('summarize-thread retrieves no scopes', () => {
    expect(getMemoryPolicy('summarize-thread').scopes).toEqual([]);
  });

  it('embed-memory-generic is a writer, not a reader', () => {
    expect(getMemoryPolicy('embed-memory-generic').scopes).toEqual([]);
  });

  it('unregistered capabilities default to no scopes', () => {
    expect(getMemoryPolicy('draft-proposal').scopes).toEqual([]);
  });

  it('assertScopesAllowed rejects any scope outside the allow-list', () => {
    // summarize-thread allows nothing, so any requested scope is a violation.
    expect(() => assertScopesAllowed('summarize-thread', ['contact'])).toThrow(
      /may not retrieve memory scope/,
    );
  });

  it('assertScopesAllowed passes for an empty request', () => {
    expect(() => assertScopesAllowed('summarize-thread', [])).not.toThrow();
  });
});
