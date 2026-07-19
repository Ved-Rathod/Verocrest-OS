'use client';

import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';
import type { BadgeProps } from '@verocrest/ui-kit';
import type { GoogleConnectionView } from '@verocrest/domain-integrations';
import {
  connectGoogleAction,
  disconnectGoogleAction,
} from '@verocrest/domain-integrations/actions';

/**
 * Google connection card (docs/07 §5, docs/11 §11). Read-mostly: Connect starts
 * the OAuth grant; Reconnect re-runs it (expired token or scope change);
 * Disconnect revokes + soft-deletes. v0.1 is identity-only — no Gmail/Calendar.
 */

const STATUS_VARIANT: Record<GoogleConnectionView['status'], BadgeProps['variant']> = {
  active: 'success',
  expired: 'warning',
  revoked: 'neutral',
};

export function GoogleConnectionCard({
  connection,
  configured,
}: {
  connection: GoogleConnectionView | null;
  configured: boolean;
}) {
  const isConnected = connection !== null && connection.status !== 'revoked';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Google</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {!configured ? (
          <p className="text-sm text-fg-muted">
            Google OAuth isn’t configured on this environment. Set the Google client credentials to
            enable connecting.
          </p>
        ) : null}

        {isConnected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg-strong">
                  {connection.email ?? 'Connected account'}
                </p>
                <p className="text-xs text-fg-subtle">
                  Connected {new Date(connection.connectedAt).toLocaleDateString('en')}
                  {connection.scopes.length > 0 ? ` · ${connection.scopes.length} scope(s)` : ''}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[connection.status]}>{connection.status}</Badge>
            </div>

            {connection.status === 'expired' ? (
              <p className="text-xs text-warning">
                The connection expired. Reconnect to restore access.
                {connection.lastError ? ` (${connection.lastError})` : ''}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-edge-subtle pt-4">
              {configured ? (
                <form action={connectGoogleAction}>
                  <Button type="submit" variant="secondary">
                    Reconnect
                  </Button>
                </form>
              ) : null}
              <form action={disconnectGoogleAction}>
                <Button type="submit" variant="danger">
                  Disconnect
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-fg-muted">Not connected.</p>
            <form action={connectGoogleAction}>
              <Button type="submit" disabled={!configured}>
                Connect Google
              </Button>
            </form>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
