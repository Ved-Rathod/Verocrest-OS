import { beforeEach, describe, expect, it } from 'vitest';
import {
  EnvValidationError,
  getServerEnv,
  parseServerEnv,
  resetServerEnvCacheForTests,
} from './env';

describe('parseServerEnv', () => {
  it('applies defaults on an empty source', () => {
    const env = parseServerEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_ENV).toBe('local');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.APP_URL).toBeUndefined();
  });

  it('accepts a complete production configuration', () => {
    const env = parseServerEnv({
      NODE_ENV: 'production',
      APP_ENV: 'production',
      APP_URL: 'https://verocrest.app',
      LOG_LEVEL: 'warn',
    });
    expect(env.APP_ENV).toBe('production');
    expect(env.APP_URL).toBe('https://verocrest.app');
  });

  it('ignores unrelated process.env noise', () => {
    const env = parseServerEnv({
      PATH: '/usr/bin',
      HOME: '/home/user',
      SOME_PLATFORM_INTERNAL: 'xyz',
      APP_ENV: 'local',
    });
    expect(env.APP_ENV).toBe('local');
  });

  it('rejects an invalid APP_ENV and names the variable', () => {
    expect(() => parseServerEnv({ APP_ENV: 'prod' })).toThrowError(EnvValidationError);
    try {
      parseServerEnv({ APP_ENV: 'prod' });
    } catch (error) {
      const e = error as EnvValidationError;
      expect(e.message).toContain('APP_ENV');
      expect(e.issues.some((i) => i.path === 'APP_ENV')).toBe(true);
    }
  });

  it('requires APP_URL when APP_ENV is production', () => {
    expect(() => parseServerEnv({ APP_ENV: 'production' })).toThrowError(
      /APP_URL is required when APP_ENV is "production"/,
    );
  });

  it('requires APP_URL when APP_ENV is staging', () => {
    expect(() => parseServerEnv({ APP_ENV: 'staging' })).toThrowError(
      /APP_URL is required when APP_ENV is "staging"/,
    );
  });

  it('does not require APP_URL for local or preview', () => {
    expect(() => parseServerEnv({ APP_ENV: 'local' })).not.toThrow();
    expect(() => parseServerEnv({ APP_ENV: 'preview' })).not.toThrow();
  });

  it('rejects a malformed APP_URL', () => {
    expect(() => parseServerEnv({ APP_ENV: 'production', APP_URL: 'not-a-url' })).toThrowError(
      EnvValidationError,
    );
  });

  it('reports every issue at once, not just the first', () => {
    try {
      parseServerEnv({ APP_ENV: 'nope', LOG_LEVEL: 'loud', NODE_ENV: 'weird' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const e = error as EnvValidationError;
      expect(e.issues.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('getServerEnv cache', () => {
  beforeEach(() => {
    resetServerEnvCacheForTests();
  });

  it('caches the first successful parse', () => {
    const first = getServerEnv();
    const second = getServerEnv();
    expect(second).toBe(first); // same object reference
  });

  it('re-parses after a cache reset', () => {
    const first = getServerEnv();
    resetServerEnvCacheForTests();
    const second = getServerEnv();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});
