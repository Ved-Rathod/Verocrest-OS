import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed OAuth `state` (docs/11 §11.1 step 2). Carries the workspace/user the
 * grant is for, the return URL, a nonce, and a short expiry — HMAC-signed with
 * `OAUTH_STATE_SECRET` so the callback can trust it without server-side storage.
 * CSRF-hardening: the callback additionally checks the payload's user against the
 * live session (docs/11 §11.1 step 5).
 */

export type OAuthState = {
  workspaceId: string;
  userId: string;
  returnUrl: string;
  nonce: string;
  exp: number; // epoch ms
};

const TTL_MS = 10 * 60 * 1000;

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function secret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s || s.length < 16) {
    throw new Error('OAUTH_STATE_SECRET is not set (min 16 chars) — required to sign OAuth state');
  }
  return s;
}

function sign(payloadB64: string): string {
  return b64url(createHmac('sha256', secret()).update(payloadB64).digest());
}

export function mintState(input: Omit<OAuthState, 'nonce' | 'exp'> & { nonce: string }): string {
  const state: OAuthState = { ...input, exp: Date.now() + TTL_MS };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(state), 'utf8'));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Verify signature + expiry. Returns the payload, or null if invalid/expired/tampered. */
export function verifyState(token: string): OAuthState | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(payloadB64);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const state = JSON.parse(fromB64url(payloadB64).toString('utf8')) as OAuthState;
    if (typeof state.exp !== 'number' || state.exp < Date.now()) return null;
    if (!state.workspaceId || !state.userId) return null;
    return state;
  } catch {
    return null;
  }
}
