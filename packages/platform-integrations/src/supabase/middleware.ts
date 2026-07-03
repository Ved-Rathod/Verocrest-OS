import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasClientEnv, getClientEnv } from '@verocrest/config';
import { toAuthUser, type AuthUser } from './types';

export type SessionRefreshResult = {
  response: NextResponse;
  user: AuthUser | null;
  /** False when Supabase env vars are absent — public pages still render;
   *  auth actions surface a clear configuration error instead of a 500. */
  configured: boolean;
};

/**
 * Middleware session refresh per the @supabase/ssr contract (docs/11 §3.4):
 * re-issues the auth cookies on every request so sessions persist across
 * token expiry (docs/10 §2.6 session management).
 */
export async function refreshSession(request: NextRequest): Promise<SessionRefreshResult> {
  let response = NextResponse.next({ request });

  if (!hasClientEnv()) {
    return { response, user: null, configured: false };
  }

  const env = getClientEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { response, user: null, configured: true };
    }
    return { response, user: toAuthUser(data.user), configured: true };
  } catch {
    // Network failure to Supabase — treat as signed-out rather than erroring
    // the whole request (fail-safe: protected routes redirect to /signin).
    return { response, user: null, configured: true };
  }
}
