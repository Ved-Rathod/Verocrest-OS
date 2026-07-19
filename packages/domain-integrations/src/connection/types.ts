/**
 * Google integration connection (docs/04 §19, docs/11 §11). v0.1 is an
 * identity-only account link — no Gmail/Calendar/Drive. The view deliberately
 * omits the encrypted token columns; tokens never leave the service layer.
 */

export const GOOGLE_PROVIDER = 'google' as const;

export type ConnectionStatus = 'active' | 'expired' | 'revoked';

export type GoogleConnectionView = {
  id: string;
  status: ConnectionStatus;
  email: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  connectedAt: string;
  lastError: string | null;
};

export function toConnectionView(row: Record<string, unknown>): GoogleConnectionView {
  const err = row.last_error as { message?: string } | null;
  return {
    id: row.id as string,
    status: row.status as ConnectionStatus,
    email: (row.external_account_email as string | null) ?? null,
    scopes: (row.scopes as string[] | null) ?? [],
    tokenExpiresAt: (row.token_expires_at as string | null) ?? null,
    connectedAt: row.created_at as string,
    lastError: err?.message ?? null,
  };
}
