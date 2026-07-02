import { z } from 'zod';

/**
 * Environment schema — Sprint 1.1 scope.
 *
 * The app refuses to boot on an invalid configuration (BUILD_ROADMAP Sprint 1
 * item 9; 12_Infrastructure_Deployment.md §5). Provider variables (Supabase,
 * Anthropic, OpenAI, Browserless, Google, Resend) are appended to this schema
 * in the sub-sprint that wires each integration, per 11_External_Integrations.md §12.
 *
 * Note on strictness: API inputs are parsed with unknown-key REJECTION
 * (10_API_Architecture.md §9.4). `process.env` is deliberately the opposite —
 * it always contains platform noise (PATH, HOME, Vercel internals), so this
 * schema picks the keys it knows and ignores the rest.
 */

/** The four isolated runtime environments (12_Infrastructure_Deployment.md §3). */
export const APP_ENVS = ['local', 'preview', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Log verbosity levels consumed by platform-observability (lands Sprint 1.4). */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const serverEnvSchema = z
  .object({
    /** Node's own mode. Managed by tooling; distinct from APP_ENV. */
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /** Which of the four environments this process runs as. */
    APP_ENV: z.enum(APP_ENVS).default('local'),

    /** Public base URL. Required once the app is reachable (staging/production). */
    APP_URL: z.string().url().optional(),

    /** Structured-logger verbosity. */
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  })
  .superRefine((env, ctx) => {
    if ((env.APP_ENV === 'staging' || env.APP_ENV === 'production') && !env.APP_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_URL'],
        message: `APP_URL is required when APP_ENV is "${env.APP_ENV}"`,
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Thrown at boot when the environment is invalid. Lists every problem at once. */
export class EnvValidationError extends Error {
  readonly issues: readonly { path: string; message: string }[];

  constructor(issues: readonly { path: string; message: string }[]) {
    const details = issues.map((i) => `  - ${i.path || '(root)'}: ${i.message}`).join('\n');
    super(`Invalid environment configuration:\n${details}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Parse and validate an environment source. Throws {@link EnvValidationError}
 * with every issue listed (not just the first) so a misconfigured deploy is
 * fixable in one pass.
 */
export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/**
 * Cached accessor — the standard way application code reads the environment.
 * First call validates; subsequent calls are free.
 */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv();
  return cached;
}

/** Test-only: clear the cache so tests can exercise different sources. */
export function resetServerEnvCacheForTests(): void {
  cached = undefined;
}
