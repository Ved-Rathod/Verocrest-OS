/**
 * Minimal ULID generator (docs/03 §8.2 — the event `id` is a ULID: a 26-char,
 * Crockford-base32, lexicographically-sortable identifier = 48-bit millisecond
 * timestamp + 80 bits of randomness). Used as the event envelope id AND the
 * at-least-once idempotency key (§8.7). Dependency-free.
 */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I,L,O,U)
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function randomByte(): number {
  // crypto is available in Node 24 + the browser + edge runtimes.
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const b = new Uint8Array(1);
    crypto.getRandomValues(b);
    return b[0]!;
  }
  return Math.floor(Math.random() * 256);
}

function encodeTime(now: number): string {
  let out = '';
  let t = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = t % 32;
    out = ENCODING[mod]! + out;
    t = (t - mod) / 32;
  }
  return out;
}

function encodeRandom(): string {
  let out = '';
  for (let i = 0; i < RANDOM_LEN; i++) {
    out += ENCODING[randomByte() % 32]!;
  }
  return out;
}

/** Generate a ULID for `at` (defaults to now). 26 uppercase base32 chars. */
export function ulid(at: number = Date.now()): string {
  return encodeTime(at) + encodeRandom();
}

/** True for a syntactically valid ULID (26 Crockford-base32 chars). */
export function isUlid(value: string): boolean {
  if (value.length !== TIME_LEN + RANDOM_LEN) return false;
  for (const ch of value) if (!ENCODING.includes(ch)) return false;
  return true;
}
