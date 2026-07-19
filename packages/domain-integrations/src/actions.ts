'use server';

import { redirect } from 'next/navigation';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { isGoogleOAuthConfigured } from '@verocrest/platform-integrations/google';
import { beginGoogleConnect, disconnectGoogle } from './connection/service';

/**
 * Google connection Server Actions (docs/11 §11.1). Redirect-based (a settings
 * surface, not a form with field errors): connect sends the user to Google's
 * consent screen; disconnect revokes + soft-deletes and returns with a flag.
 * `redirect()` is always called OUTSIDE try/catch (it signals via a thrown
 * control-flow error).
 */

const RETURN_URL = '/settings/integrations';

export async function connectGoogleAction(): Promise<void> {
  const ctx = await requireWorkspaceContext();
  if (!isGoogleOAuthConfigured()) redirect(`${RETURN_URL}?error=not_configured`);
  const authorizeUrl = beginGoogleConnect(ctx, RETURN_URL);
  redirect(authorizeUrl);
}

export async function disconnectGoogleAction(): Promise<void> {
  const ctx = await requireWorkspaceContext();
  let ok = true;
  try {
    ok = await disconnectGoogle(ctx);
  } catch {
    ok = false;
  }
  redirect(ok ? `${RETURN_URL}?disconnected=1` : `${RETURN_URL}?error=disconnect_failed`);
}
