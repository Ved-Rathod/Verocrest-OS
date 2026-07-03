import { describe, expect, it } from 'vitest';
import { EnvValidationError } from './env';
import { parseClientEnv } from './client-env';

describe('parseClientEnv', () => {
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc123.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example',
  };

  it('accepts a valid configuration', () => {
    const env = parseClientEnv(valid);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(valid.NEXT_PUBLIC_SUPABASE_URL);
  });

  it('rejects a missing URL and names the variable', () => {
    expect(() =>
      parseClientEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY }),
    ).toThrowError(EnvValidationError);
    try {
      parseClientEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY });
    } catch (error) {
      expect((error as EnvValidationError).message).toContain('NEXT_PUBLIC_SUPABASE_URL');
    }
  });

  it('rejects a malformed URL', () => {
    expect(() => parseClientEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' })).toThrowError(
      EnvValidationError,
    );
  });

  it('rejects an implausibly short anon key', () => {
    expect(() => parseClientEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'short' })).toThrowError(
      EnvValidationError,
    );
  });
});
