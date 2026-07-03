'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClientEnv } from '@verocrest/config';

let client: SupabaseClient | undefined;

/**
 * Browser Supabase client (singleton) — used only where a client-side flow is
 * required (Google OAuth redirect start). All other auth mutations go through
 * Server Actions per docs/10 §3.1.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    const env = getClientEnv();
    client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}
