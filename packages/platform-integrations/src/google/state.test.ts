import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mintState, verifyState } from './state';

const base = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  returnUrl: '/settings/integrations',
  nonce: 'abc123',
};

describe('OAuth signed state', () => {
  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'test-secret-at-least-16-chars';
  });
  afterEach(() => {
    delete process.env.OAUTH_STATE_SECRET;
  });

  it('mints and verifies a valid state', () => {
    const token = mintState(base);
    const parsed = verifyState(token);
    expect(parsed?.workspaceId).toBe(base.workspaceId);
    expect(parsed?.userId).toBe(base.userId);
    expect(parsed?.returnUrl).toBe(base.returnUrl);
  });

  it('rejects a tampered payload', () => {
    const token = mintState(base);
    const [payload, sig] = token.split('.');
    const forged = Buffer.from('{"workspaceId":"evil"}').toString('base64url');
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    expect(verifyState(`${payload}.deadbeef`)).toBeNull();
  });

  it('rejects an expired state', () => {
    const token = mintState(base);
    const [payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString());
    payload.exp = Date.now() - 1000;
    const stale = Buffer.from(JSON.stringify(payload)).toString('base64url');
    // Re-sign the stale payload with the real secret so only expiry fails.
    const sig = createHmac('sha256', process.env.OAUTH_STATE_SECRET!)
      .update(stale)
      .digest('base64url');
    expect(verifyState(`${stale}.${sig}`)).toBeNull();
  });

  it('rejects a state signed with a different secret', () => {
    const token = mintState(base);
    process.env.OAUTH_STATE_SECRET = 'a-completely-different-secret';
    expect(verifyState(token)).toBeNull();
  });
});
