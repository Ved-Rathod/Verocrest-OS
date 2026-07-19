import { describe, expect, it } from 'vitest';
import { toConnectionView } from './types';

describe('toConnectionView', () => {
  it('maps a row to the token-free view', () => {
    const view = toConnectionView({
      id: 'c1',
      status: 'active',
      external_account_email: 'owner@acme.com',
      scopes: ['openid', 'email'],
      token_expires_at: '2026-07-19T12:00:00.000Z',
      created_at: '2026-07-19T10:00:00.000Z',
      last_error: null,
    });
    expect(view).toEqual({
      id: 'c1',
      status: 'active',
      email: 'owner@acme.com',
      scopes: ['openid', 'email'],
      tokenExpiresAt: '2026-07-19T12:00:00.000Z',
      connectedAt: '2026-07-19T10:00:00.000Z',
      lastError: null,
    });
    // Never surfaces token columns.
    expect(view).not.toHaveProperty('encrypted_access_token');
  });

  it('surfaces the last error message and tolerates null scopes', () => {
    const view = toConnectionView({
      id: 'c2',
      status: 'expired',
      external_account_email: null,
      scopes: null,
      token_expires_at: null,
      created_at: '2026-07-19T10:00:00.000Z',
      last_error: { message: 'invalid_grant' },
    });
    expect(view.status).toBe('expired');
    expect(view.email).toBeNull();
    expect(view.scopes).toEqual([]);
    expect(view.lastError).toBe('invalid_grant');
  });
});
