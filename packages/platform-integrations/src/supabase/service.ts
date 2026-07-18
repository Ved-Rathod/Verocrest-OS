import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getClientEnv } from '@verocrest/config';

/**
 * Service-role Supabase client (docs/11 §3.4) — bypasses RLS. Used ONLY by
 * trusted, user-less server paths: the Event Bus reconciliation cron and the
 * one-shot journal replay (Sprint 3.2), which read `event_journal` across every
 * workspace. Never import this into a request/UI path — those use the cookie-based
 * {@link createSupabaseServerClient}, which enforces RLS.
 *
 * The key is read from the environment at call time (not app boot) so the
 * request-serving runtime, which never sets it, is unaffected.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  const env = getClientEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — required for Event Bus reconciliation/replay (docs/12 §3).',
    );
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
