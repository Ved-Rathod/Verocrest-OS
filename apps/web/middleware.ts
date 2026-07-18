import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession } from '@verocrest/platform-integrations/supabase/middleware';

/**
 * Auth middleware per docs/10 §2.6–2.8 (session refresh + route protection).
 * Workspace resolution + tenancy GUCs land with the Workspace sprint.
 *
 * Never bypass: everything not explicitly public requires a session.
 */

// `/api/inngest` is the Agency Event Bus serve endpoint (Sprint 3.2). It is
// authenticated by Inngest request signatures (docs/12 §3), NOT by a user session,
// so it must bypass the auth redirect or Inngest can never reach the subscribers.
const PUBLIC_PREFIXES = ['/signin', '/signup', '/forgot-password', '/auth', '/api/inngest'];

// Signed-in users have no business on these pages; bounce them home.
const AUTH_PAGES = ['/signin', '/signup', '/forgot-password'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user, configured } = await refreshSession(request);

  // Unconfigured local env: let public pages render with a clear in-form error
  // instead of a 500; protected routes still redirect to /signin (fail-safe).
  if (!configured) {
    if (isPublic(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    return NextResponse.redirect(url);
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.some((p) => pathname === p)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Everything except static assets and files with extensions.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
