import { describe, expect, it } from 'vitest';
import { fail, internalError, ok } from './result';

describe('action-result envelope', () => {
  it('ok wraps data with a request id and null error', () => {
    const r = ok({ x: 1 });
    expect(r.data).toEqual({ x: 1 });
    expect(r.error).toBeNull();
    expect(r.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('fail wraps an error with null data', () => {
    const r = fail(internalError());
    expect(r.data).toBeNull();
    expect(r.error?.code).toBe('INTERNAL');
    expect(r.error?.retryable).toBe(true);
  });

  it('each envelope gets a distinct request id', () => {
    expect(ok(1).requestId).not.toBe(ok(1).requestId);
  });
});
