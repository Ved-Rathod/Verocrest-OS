import type { ActionError } from './result';

/**
 * Map Supabase Auth errors to the canonical codes of docs/10 §10.2 with
 * user-facing copy in the voice of docs/08 §14 / docs/07 §16 — what happened,
 * then what to do. Raw provider errors never reach the UI (docs/11 §14.3).
 */

const CONFIG_MISSING: ActionError = {
  code: 'INTEGRATION_DOWN',
  category: 'integration',
  message:
    'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.',
  retryable: false,
};

export const authErrors = {
  configMissing: (): ActionError => CONFIG_MISSING,

  invalidCredentials: (): ActionError => ({
    code: 'AUTH_INVALID_CREDENTIALS',
    category: 'authentication',
    message: 'Email or password is incorrect.',
    retryable: false,
  }),

  emailExists: (): ActionError => ({
    code: 'AUTH_EMAIL_EXISTS',
    category: 'business',
    message: 'An account exists with this email. Sign in instead.',
    retryable: false,
  }),

  emailUnverified: (): ActionError => ({
    code: 'AUTH_EMAIL_UNVERIFIED',
    category: 'authentication',
    message: 'Verify your email first — we sent you a link. Check spam if it hasn’t arrived.',
    retryable: false,
  }),

  passwordWeak: (detail?: string): ActionError => ({
    code: 'AUTH_PASSWORD_WEAK',
    category: 'validation',
    message: detail ?? 'Passwords must be at least 12 characters.',
    retryable: false,
    fieldErrors: { password: detail ?? 'Must be at least 12 characters' },
  }),

  passwordBreached: (): ActionError => ({
    code: 'AUTH_PASSWORD_BREACHED',
    category: 'validation',
    message:
      'This password appears in known data breaches. Choose a different one — a password manager helps.',
    retryable: false,
    fieldErrors: { password: 'Found in known breaches — choose another' },
  }),

  resetTokenInvalid: (): ActionError => ({
    code: 'AUTH_RESET_TOKEN_INVALID',
    category: 'authentication',
    message: 'This reset link is invalid or has expired. Request a new one.',
    retryable: false,
  }),

  sessionExpired: (): ActionError => ({
    code: 'AUTH_SESSION_EXPIRED',
    category: 'authentication',
    message: 'Your session expired. Sign in again.',
    retryable: false,
  }),

  rateLimited: (): ActionError => ({
    code: 'RATE_LIMITED',
    category: 'rate_limit',
    message: 'Too many attempts. Wait a minute and try again.',
    retryable: true,
  }),

  validation: (fieldErrors: Record<string, string>): ActionError => ({
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: 'Some fields need attention.',
    retryable: false,
    fieldErrors,
  }),

  internal: (): ActionError => ({
    code: 'INTERNAL',
    category: 'internal',
    message: 'Something didn’t go through. Try again.',
    retryable: true,
  }),
} as const;

/**
 * Classify a Supabase Auth error into a canonical ActionError.
 * Supabase surfaces machine-readable `code` values on AuthApiError.
 */
export function mapSupabaseAuthError(error: {
  code?: string;
  status?: number;
  message?: string;
}): ActionError {
  switch (error.code) {
    case 'invalid_credentials':
      return authErrors.invalidCredentials();
    case 'email_exists':
    case 'user_already_exists':
      return authErrors.emailExists();
    case 'email_not_confirmed':
      return authErrors.emailUnverified();
    case 'weak_password':
      return authErrors.passwordWeak();
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return authErrors.rateLimited();
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
      return authErrors.resetTokenInvalid();
    case 'session_expired':
    case 'session_not_found':
    case 'refresh_token_not_found':
      return authErrors.sessionExpired();
    default:
      break;
  }
  if (error.status === 429) return authErrors.rateLimited();
  if (error.status === 400 && /password/i.test(error.message ?? '')) {
    return authErrors.passwordWeak();
  }
  return authErrors.internal();
}
