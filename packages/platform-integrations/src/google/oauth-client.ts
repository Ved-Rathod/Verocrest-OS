import { OAuth2Client } from 'google-auth-library';

/**
 * Google OAuth adapter (docs/11 §7, §11). The ONLY module that imports
 * `google-auth-library`. Sprint 4.5 requests identity scopes only — no Gmail,
 * Calendar, or Drive — so this is a pure account-connection foundation. Later
 * sprints add API scopes without changing this plumbing.
 */

export const GOOGLE_IDENTITY_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
] as const;

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null; // ISO8601
  scopes: string[];
  externalAccountId: string | null;
  externalAccountEmail: string | null;
};

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
};

/** Read + validate the founder-provisioned Google OAuth env (docs/11 §7 config). */
export function readGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUrl = process.env.GOOGLE_OAUTH_REDIRECT_URL;
  if (!clientId || !clientSecret || !redirectUrl) return null;
  return { clientId, clientSecret, redirectUrl };
}

function requireConfig(): GoogleOAuthConfig {
  const config = readGoogleOAuthConfig();
  if (!config) {
    throw new Error(
      'Google OAuth is not configured (GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REDIRECT_URL)',
    );
  }
  return config;
}

function client(config: GoogleOAuthConfig): OAuth2Client {
  return new OAuth2Client(config.clientId, config.clientSecret, config.redirectUrl);
}

/** True when the deployment can perform live grants (founder-gated). */
export function isGoogleOAuthConfigured(): boolean {
  return readGoogleOAuthConfig() !== null;
}

export function buildAuthorizeUrl(state: string): string {
  const config = requireConfig();
  return client(config).generateAuthUrl({
    access_type: 'offline', // request a long-lived refresh token
    prompt: 'consent', // force refresh_token issuance on reconnect
    include_granted_scopes: true,
    scope: [...GOOGLE_IDENTITY_SCOPES],
    state,
  });
}

function toTokens(
  creds: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    scope?: string | null;
  },
  identity: { sub: string | null; email: string | null },
): GoogleTokens {
  if (!creds.access_token) throw new Error('Google did not return an access token');
  return {
    accessToken: creds.access_token,
    refreshToken: creds.refresh_token ?? null,
    expiresAt: creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
    scopes: creds.scope ? creds.scope.split(' ').filter(Boolean) : [...GOOGLE_IDENTITY_SCOPES],
    externalAccountId: identity.sub,
    externalAccountEmail: identity.email,
  };
}

/** Exchange an authorization code for tokens + the connected account's identity. */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const config = requireConfig();
  const oauth = client(config);
  const { tokens } = await oauth.getToken(code);
  let identity: { sub: string | null; email: string | null } = { sub: null, email: null };
  if (tokens.id_token) {
    const ticket = await oauth.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    const payload = ticket.getPayload();
    identity = { sub: payload?.sub ?? null, email: payload?.email ?? null };
  }
  return toTokens(tokens, identity);
}

/** Refresh an access token from a stored refresh token (docs/11 §11.3, lazy). */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string | null }> {
  const config = requireConfig();
  const oauth = client(config);
  oauth.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth.refreshAccessToken();
  if (!credentials.access_token) throw new Error('Google refresh returned no access token');
  return {
    accessToken: credentials.access_token,
    expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
  };
}

/** Revoke a token at Google (docs/11 §7.3 disconnect). Best-effort. */
export async function revokeToken(token: string): Promise<void> {
  const config = requireConfig();
  await client(config).revokeToken(token);
}
