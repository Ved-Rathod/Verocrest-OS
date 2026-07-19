import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import {
  buildAuthorizeUrl,
  createTokenCipher,
  exchangeCode,
  mintState,
  refreshAccessToken,
  revokeToken,
  verifyState,
  type OAuthState,
} from '@verocrest/platform-integrations/google';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { GOOGLE_PROVIDER, toConnectionView, type GoogleConnectionView } from './types';

/**
 * Google connection service (docs/11 §11). Server-only; RLS-scoped via the cookie
 * client. Encrypts tokens with the TokenCipher before persisting, journals
 * connect/disconnect through the atomic `*_with_event` RPCs, and refreshes access
 * tokens lazily (no scheduled jobs — Sprint 4.5 scope). No Gmail/Calendar/Drive.
 */

const REFRESH_SKEW_MS = 60_000; // refresh 60s before expiry (docs/11 §11.2)

/** The current (non-revoked) connection for this workspace+user, or null. */
export async function getGoogleConnection(
  ctx: WorkspaceContext,
): Promise<GoogleConnectionView | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('integration_connections')
    .select('id, status, external_account_email, scopes, token_expires_at, created_at, last_error')
    .eq('workspace_id', ctx.workspaceId)
    .eq('provider', GOOGLE_PROVIDER)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toConnectionView(data) : null;
}

/** Begin a connect (or reconnect): mint signed state, return the Google authorize URL. */
export function beginGoogleConnect(ctx: WorkspaceContext, returnUrl: string): string {
  const state = mintState({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    returnUrl,
    nonce: randomUUID(),
  });
  return buildAuthorizeUrl(state);
}

export type CompleteResult = { returnUrl: string };

/**
 * Complete the OAuth callback: verify state against the live session, exchange
 * the code, encrypt + persist tokens, and journal `integration.google.connected`.
 * Throws on any failure; the route maps errors to a redirect (docs/10 §5.6).
 */
export async function completeGoogleConnect(
  ctx: WorkspaceContext,
  params: { code: string; state: string },
): Promise<CompleteResult> {
  const state = verifyState(params.state);
  if (!state) throw new Error('invalid_state');
  assertStateMatchesSession(state, ctx);

  const tokens = await exchangeCode(params.code);
  const cipher = createTokenCipher();
  const encAccess = await cipher.encrypt(tokens.accessToken);
  const encRefresh = tokens.refreshToken ? await cipher.encrypt(tokens.refreshToken) : null;

  const id = randomUUID();
  const event = buildEvent({
    name: 'integration.google.connected',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { connection_id: id, provider: GOOGLE_PROVIDER, email: tokens.externalAccountEmail },
  });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('connect_google_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_user: ctx.userId,
    p_provider: GOOGLE_PROVIDER,
    p_external_account_id: tokens.externalAccountId,
    p_external_account_email: tokens.externalAccountEmail,
    p_enc_access: encAccess,
    p_enc_refresh: encRefresh,
    p_expires: tokens.expiresAt,
    p_scopes: tokens.scopes,
    p_metadata: {},
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  // The connected row may reuse an existing id on reconnect (ON CONFLICT); the
  // journal keys off the returned row, so re-read for the canonical subject id.
  const connectionId = (data as { id?: string } | null)?.id ?? id;
  await publishToBus({ ...event, subject: { ...event.subject, id: connectionId } });
  return { returnUrl: state.returnUrl };
}

/** Disconnect: revoke at Google (best-effort), soft-delete, journal disconnected. */
export async function disconnectGoogle(ctx: WorkspaceContext): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from('integration_connections')
    .select('id, encrypted_refresh_token, encrypted_access_token')
    .eq('workspace_id', ctx.workspaceId)
    .eq('provider', GOOGLE_PROVIDER)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!row) return false;

  // Revoke at the provider before flipping local state (docs/11 §7.3). Best-effort:
  // a provider-side failure must not strand the local row as un-disconnectable.
  const cipher = createTokenCipher();
  const sealed = (row.encrypted_refresh_token ?? row.encrypted_access_token) as string | null;
  if (sealed) {
    try {
      await revokeToken(await cipher.decrypt(sealed));
    } catch {
      // swallow — local disconnect proceeds regardless
    }
  }

  const id = row.id as string;
  const event = buildEvent({
    name: 'integration.google.disconnected',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { connection_id: id, provider: GOOGLE_PROVIDER },
  });
  const { data: ok, error: rpcError } = await supabase.rpc('disconnect_google_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_event: journalRowFromEnvelope(event),
  });
  if (rpcError) throw rpcError;
  if (ok) await publishToBus(event);
  return Boolean(ok);
}

/**
 * Lazy refresh (docs/11 §11.3): if the active access token is within the skew
 * window, exchange the refresh token for a new one and persist it. A 401 flips
 * the connection to `expired` so the UI prompts reconnect. Returns the resulting
 * status, or null when there is no active connection. No scheduled jobs.
 */
export async function refreshGoogleIfNeeded(
  ctx: WorkspaceContext,
): Promise<'active' | 'expired' | 'none'> {
  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from('integration_connections')
    .select('id, encrypted_refresh_token, token_expires_at, status')
    .eq('workspace_id', ctx.workspaceId)
    .eq('provider', GOOGLE_PROVIDER)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!row) return 'none';

  const expiresAt = row.token_expires_at as string | null;
  const fresh = expiresAt ? new Date(expiresAt).getTime() - Date.now() > REFRESH_SKEW_MS : false;
  if (fresh) return 'active';

  const sealedRefresh = row.encrypted_refresh_token as string | null;
  if (!sealedRefresh) return 'active'; // nothing to refresh with; leave as-is

  const cipher = createTokenCipher();
  try {
    const refreshToken = await cipher.decrypt(sealedRefresh);
    const refreshed = await refreshAccessToken(refreshToken);
    const encAccess = await cipher.encrypt(refreshed.accessToken);
    const { error: updateError } = await supabase.rpc('update_integration_tokens', {
      p_id: row.id,
      p_workspace: ctx.workspaceId,
      p_enc_access: encAccess,
      p_expires: refreshed.expiresAt,
    });
    if (updateError) throw updateError;
    return 'active';
  } catch (cause) {
    await supabase.rpc('expire_integration_connection', {
      p_id: row.id,
      p_workspace: ctx.workspaceId,
      p_error: { message: cause instanceof Error ? cause.message : 'refresh_failed' },
    });
    return 'expired';
  }
}

function assertStateMatchesSession(state: OAuthState, ctx: WorkspaceContext): void {
  if (state.workspaceId !== ctx.workspaceId || state.userId !== ctx.userId) {
    throw new Error('state_session_mismatch');
  }
}
