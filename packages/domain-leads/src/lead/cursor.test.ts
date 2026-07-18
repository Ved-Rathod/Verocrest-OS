import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

describe('lead cursor codec', () => {
  const cursor = {
    createdAt: '2026-07-03T12:00:00.000Z',
    id: '11111111-1111-1111-1111-111111111111',
  };

  it('round-trips', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('decodes malformed input to null', () => {
    expect(decodeCursor('not-base64!!')).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(Buffer.from('{"c":"nope","i":"x"}').toString('base64url'))).toBeNull();
  });
});
