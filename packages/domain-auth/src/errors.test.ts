import { describe, expect, it } from 'vitest';
import { mapSupabaseAuthError } from './errors';

describe('mapSupabaseAuthError', () => {
  it('maps invalid_credentials', () => {
    expect(mapSupabaseAuthError({ code: 'invalid_credentials' }).code).toBe(
      'AUTH_INVALID_CREDENTIALS',
    );
  });

  it('maps duplicate email variants', () => {
    expect(mapSupabaseAuthError({ code: 'email_exists' }).code).toBe('AUTH_EMAIL_EXISTS');
    expect(mapSupabaseAuthError({ code: 'user_already_exists' }).code).toBe('AUTH_EMAIL_EXISTS');
  });

  it('maps unverified email', () => {
    expect(mapSupabaseAuthError({ code: 'email_not_confirmed' }).code).toBe(
      'AUTH_EMAIL_UNVERIFIED',
    );
  });

  it('maps weak password with field error', () => {
    const err = mapSupabaseAuthError({ code: 'weak_password' });
    expect(err.code).toBe('AUTH_PASSWORD_WEAK');
    expect(err.fieldErrors).toHaveProperty('password');
  });

  it('maps rate limits by code and by status', () => {
    expect(mapSupabaseAuthError({ code: 'over_request_rate_limit' }).code).toBe('RATE_LIMITED');
    expect(mapSupabaseAuthError({ status: 429 }).code).toBe('RATE_LIMITED');
    expect(mapSupabaseAuthError({ status: 429 }).retryable).toBe(true);
  });

  it('maps expired recovery flows to reset-token-invalid', () => {
    expect(mapSupabaseAuthError({ code: 'otp_expired' }).code).toBe('AUTH_RESET_TOKEN_INVALID');
  });

  it('falls back to INTERNAL for unknown errors without leaking provider detail', () => {
    const err = mapSupabaseAuthError({ code: 'something_novel', message: 'raw provider text' });
    expect(err.code).toBe('INTERNAL');
    expect(err.message).not.toContain('raw provider text');
  });
});
