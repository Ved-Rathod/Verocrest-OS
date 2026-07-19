import { NextResponse, type NextRequest } from 'next/server';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { completeGoogleConnect } from '@verocrest/domain-integrations/server';

/**
 * Google OAuth callback for the workspace *integration* connect flow (docs/11
 * §11.1, Sprint 4.5 D2). Distinct from `/api/auth/google/callback` (app
 * social-login, docs/10 §5.6) — that route is untouched. The user's session
 * cookie is present (top-level redirect), so this resolves the live workspace
 * context and verifies it against the signed state inside completeGoogleConnect.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const settings = new URL('/settings/integrations', url.origin);

  const providerError = url.searchParams.get('error');
  if (providerError) {
    settings.searchParams.set('error', 'oauth_denied');
    return NextResponse.redirect(settings);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    settings.searchParams.set('error', 'connect_failed');
    return NextResponse.redirect(settings);
  }

  try {
    const ctx = await requireWorkspaceContext();
    const { returnUrl } = await completeGoogleConnect(ctx, { code, state });
    const dest = new URL(returnUrl, url.origin);
    dest.searchParams.set('connected', '1');
    return NextResponse.redirect(dest);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.redirect(new URL('/signin?next=/settings/integrations', url.origin));
    }
    settings.searchParams.set('error', 'connect_failed');
    return NextResponse.redirect(settings);
  }
}
