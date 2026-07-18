import { afterEach, describe, expect, it } from 'vitest';
import {
  isCallAllowed,
  recordFailure,
  recordSuccess,
  resetCircuitBreakersForTests,
} from './circuit-breaker';

afterEach(() => resetCircuitBreakersForTests());

describe('circuit breaker (in-memory, per provider)', () => {
  it('stays closed under the failure threshold', () => {
    recordFailure('anthropic');
    recordFailure('anthropic');
    expect(isCallAllowed('anthropic')).toBe(true);
  });

  it('opens after 3 consecutive failures and blocks during cooldown', () => {
    const t0 = 1_000_000;
    recordFailure('anthropic', t0);
    recordFailure('anthropic', t0);
    recordFailure('anthropic', t0);
    expect(isCallAllowed('anthropic', t0 + 1_000)).toBe(false);
  });

  it('half-opens after the cooldown and closes again on success', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) recordFailure('anthropic', t0);
    expect(isCallAllowed('anthropic', t0 + 30_000)).toBe(true); // half-open trial
    recordSuccess('anthropic');
    expect(isCallAllowed('anthropic', t0 + 30_001)).toBe(true);
  });

  it('tracks providers independently', () => {
    for (let i = 0; i < 3; i++) recordFailure('anthropic', 1_000_000);
    expect(isCallAllowed('anthropic', 1_000_001)).toBe(false);
    expect(isCallAllowed('mock', 1_000_001)).toBe(true);
  });
});
