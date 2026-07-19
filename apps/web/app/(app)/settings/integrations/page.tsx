import type { Metadata } from 'next';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getGoogleConnection, refreshGoogleIfNeeded } from '@verocrest/domain-integrations/server';
import { isGoogleOAuthConfigured } from '@verocrest/platform-integrations/google';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { GoogleConnectionCard } from '@/components/settings/integrations/google-connection-card';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

const NOTICES: Record<string, { tone: 'success' | 'error'; text: string }> = {
  connected: { tone: 'success', text: 'Google account connected.' },
  disconnected: { tone: 'success', text: 'Google account disconnected.' },
  not_configured: {
    tone: 'error',
    text: 'Google OAuth is not configured on this environment.',
  },
  oauth_denied: { tone: 'error', text: 'The Google authorization was cancelled or denied.' },
  connect_failed: { tone: 'error', text: 'Could not complete the Google connection. Try again.' },
  disconnect_failed: { tone: 'error', text: 'Could not disconnect. Try again.' },
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireWorkspaceContext();
  // Lazy refresh (docs/11 §11.2): if the access token is near expiry, rotate it
  // now so the displayed status is truthful. No scheduled jobs — refresh is
  // driven by access, and viewing the connection is an access.
  await refreshGoogleIfNeeded(ctx);
  const [connection, params] = await Promise.all([getGoogleConnection(ctx), searchParams]);
  const configured = isGoogleOAuthConfigured();

  const key =
    (params.connected && 'connected') ||
    (params.disconnected && 'disconnected') ||
    (typeof params.error === 'string' ? params.error : undefined);
  const notice = key ? NOTICES[key] : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <SettingsTabs />
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Integrations</h1>
        <p className="text-sm text-fg-muted">
          Connect external accounts to this workspace. Tokens are stored encrypted.
        </p>
      </div>

      {notice ? (
        <div
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            notice.tone === 'success'
              ? 'border-success/40 bg-success-surface text-success'
              : 'border-danger/40 bg-danger-surface text-danger'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <GoogleConnectionCard connection={connection} configured={configured} />
    </div>
  );
}
