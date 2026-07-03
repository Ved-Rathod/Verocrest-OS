import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getClientEnv, hasClientEnv } from '@verocrest/config';
import { toAuthUser, type AuthUser } from './types';

/**
 * Server-side Supabase client (Server Actions, Route Handlers, Server Components)
 * per docs/11 §3.4. Cookie-based session; tokens never surface to client JS
 * (docs/10 §9.10).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const env = getClientEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; middleware refresh handles it.
        }
      },
    },
  });
}

/** Current authenticated user, or null. Verifies against Supabase Auth
 *  (`getUser`), never trusts the local JWT alone. Env-safe: returns null when
 *  Supabase is unconfigured (middleware already fails protected routes closed). */
export async function getAuthUser(): Promise<AuthUser | null> {
  if (!hasClientEnv()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toAuthUser(data.user);
}
