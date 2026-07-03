import { z } from 'zod';
import { EnvValidationError } from './env';

/**
 * Client-safe environment — docs/11 §3.10: SUPABASE_URL + ANON_KEY are the only
 * browser-exposed values (RLS makes the anon key safe to ship). Everything else
 * stays server-only; no other NEXT_PUBLIC_ vars may be added without a blueprint
 * anchor.
 *
 * NOTE: Next.js inlines NEXT_PUBLIC_* at build time only for LITERAL member
 * access, so callers must pass the values explicitly (see getClientEnv below).
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({ message: 'must be the Supabase project URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, { message: 'must be the Supabase anon key' }),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  const result = clientEnvSchema.safeParse(source);
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

/** True when Supabase env is present — lets public pages render with a clear
 *  configuration error instead of a mystery 500 while a dev env is unset. */
export function hasClientEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let cached: ClientEnv | undefined;

/** Validated client env. Literal access below is required for Next.js inlining. */
export function getClientEnv(): ClientEnv {
  cached ??= parseClientEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return cached;
}

/** Test-only. */
export function resetClientEnvCacheForTests(): void {
  cached = undefined;
}
