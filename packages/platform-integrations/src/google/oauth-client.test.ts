import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GOOGLE_IDENTITY_SCOPES,
  buildAuthorizeUrl,
  isGoogleOAuthConfigured,
  readGoogleOAuthConfig,
} from './oauth-client';

const REDIRECT = 'http://localhost:3000/api/integrations/google/callback';

describe('Google OAuth config + authorize URL', () => {
  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URL = REDIRECT;
  });
  afterEach(() => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URL;
  });

  it('reports configured when all three env vars are present', () => {
    expect(isGoogleOAuthConfigured()).toBe(true);
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    expect(isGoogleOAuthConfigured()).toBe(false);
    expect(readGoogleOAuthConfig()).toBeNull();
  });

  it('builds an offline consent URL with identity scopes only (no Gmail/Calendar/Drive)', () => {
    const url = new URL(buildAuthorizeUrl('signed-state-123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline'); // refresh token
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('signed-state-123');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);

    const scope = url.searchParams.get('scope') ?? '';
    for (const s of GOOGLE_IDENTITY_SCOPES) expect(scope).toContain(s);
    expect(scope).not.toContain('gmail');
    expect(scope).not.toContain('calendar');
    expect(scope).not.toContain('drive');
  });

  it('throws a clear error when building an authorize URL unconfigured', () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(() => buildAuthorizeUrl('s')).toThrow(/not configured/);
  });
});
