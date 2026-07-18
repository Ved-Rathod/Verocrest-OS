/**
 * In-memory, per-process circuit breaker (docs/11 §5; Sprint 3.3 decision #7 —
 * no Redis, no distributed state). One breaker per provider name. Opens after
 * FAILURE_THRESHOLD consecutive failures; half-opens after COOLDOWN_MS allowing
 * a single trial call; closes again on success.
 */

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;

type BreakerState = {
  consecutiveFailures: number;
  openedAt: number | null;
};

const breakers = new Map<string, BreakerState>();

function get(name: string): BreakerState {
  let state = breakers.get(name);
  if (!state) {
    state = { consecutiveFailures: 0, openedAt: null };
    breakers.set(name, state);
  }
  return state;
}

/** True when calls to this provider may proceed (closed or half-open trial). */
export function isCallAllowed(name: string, now = Date.now()): boolean {
  const state = get(name);
  if (state.openedAt === null) return true;
  return now - state.openedAt >= COOLDOWN_MS; // half-open: allow a trial
}

export function recordSuccess(name: string): void {
  const state = get(name);
  state.consecutiveFailures = 0;
  state.openedAt = null;
}

export function recordFailure(name: string, now = Date.now()): void {
  const state = get(name);
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    state.openedAt = now;
  }
}

export function resetCircuitBreakersForTests(): void {
  breakers.clear();
}
