import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

describe('reminder keyset cursor', () => {
  it('round-trips a (dueAt, id) cursor', () => {
    const cursor = {
      dueAt: '2026-08-01T10:00:00.000Z',
      id: '11111111-1111-1111-1111-111111111111',
    };
    const decoded = decodeCursor(encodeCursor(cursor));
    expect(decoded).toEqual(cursor);
  });

  it('returns null for null/undefined/empty input', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('returns null for malformed base64 / json', () => {
    expect(decodeCursor('!!!not-base64!!!')).toBeNull();
    expect(decodeCursor(Buffer.from('not json', 'utf8').toString('base64url'))).toBeNull();
  });

  it('returns null when fields are missing or the wrong type', () => {
    const noId = Buffer.from(JSON.stringify({ d: '2026-08-01T10:00:00Z' }), 'utf8').toString(
      'base64url',
    );
    const numId = Buffer.from(JSON.stringify({ d: '2026-08-01T10:00:00Z', i: 5 }), 'utf8').toString(
      'base64url',
    );
    expect(decodeCursor(noId)).toBeNull();
    expect(decodeCursor(numId)).toBeNull();
  });

  it('returns null when dueAt is not a valid date', () => {
    const bad = Buffer.from(JSON.stringify({ d: 'nope', i: 'x' }), 'utf8').toString('base64url');
    expect(decodeCursor(bad)).toBeNull();
  });
});
