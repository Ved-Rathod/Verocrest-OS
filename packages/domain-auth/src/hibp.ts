/**
 * Have-I-Been-Pwned breach check per NFR-SEC-009 / docs/10 §5.2, using the
 * k-anonymity range API: only the first 5 chars of the SHA-1 leave the server;
 * the password itself never does. FAIL-OPEN: a network problem must not block
 * signups — availability of signup outranks this defense-in-depth layer.
 */

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2500;

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const res = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false; // fail-open

    const body = await res.text();
    for (const line of body.split('\n')) {
      const [candidate, count] = line.trim().split(':');
      if (candidate === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false; // fail-open: log-and-continue wiring lands with observability (Sprint 1.4)
  }
}
