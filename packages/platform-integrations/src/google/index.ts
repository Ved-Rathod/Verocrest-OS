// @verocrest/platform-integrations/google — Google OAuth adapter (docs/11 §7, §11).
// Vendor SDK (`google-auth-library`) is imported ONLY within this directory.
export {
  GOOGLE_IDENTITY_SCOPES,
  readGoogleOAuthConfig,
  isGoogleOAuthConfigured,
  buildAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  type GoogleTokens,
  type GoogleOAuthConfig,
} from './oauth-client';
export { createTokenCipher, createTokenCipherWithKey, type TokenCipher } from './token-cipher';
export { mintState, verifyState, type OAuthState } from './state';
