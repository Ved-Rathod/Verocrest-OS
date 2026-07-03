import { describe, expect, it } from 'vitest';
import { signInSchema, signUpSchema, toFieldErrors } from './validation';

describe('signUpSchema', () => {
  it('accepts a valid signup and normalizes the email', () => {
    const parsed = signUpSchema.parse({
      email: '  Founder@Example.COM ',
      password: 'a-long-enough-password',
    });
    expect(parsed.email).toBe('founder@example.com');
  });

  it('rejects passwords under 12 characters (NFR-SEC-009)', () => {
    const result = signUpSchema.safeParse({ email: 'a@b.co', password: 'elevenchars' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error)).toHaveProperty('password');
    }
  });

  it('rejects malformed emails with a named field error', () => {
    const result = signUpSchema.safeParse({ email: 'not-an-email', password: 'a'.repeat(12) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error)['email']).toBe('Email format is invalid');
    }
  });

  it('rejects unknown keys (docs/10 §9.4 strict boundary)', () => {
    const result = signUpSchema.safeParse({
      email: 'a@b.co',
      password: 'a'.repeat(12),
      admin: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('does not enforce the 12-char minimum on sign-in (legacy passwords must still sign in)', () => {
    const result = signInSchema.safeParse({ email: 'a@b.co', password: 'short' });
    expect(result.success).toBe(true);
  });
});
