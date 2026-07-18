/**
 * Opaque keyset cursor (docs/10 §12.3) — (created_at desc, id desc), matching
 * idx_leads_ws_created_id. Malformed cursors decode to null (first page).
 * NOTE: intentionally duplicated from domain-contacts (cross-domain imports are
 * forbidden, 03 §5); consolidates into platform-db when that package lands.
 */
export type KeysetCursor = { createdAt: string; id: string };

export function encodeCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify({ c: cursor.createdAt, i: cursor.id });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): KeysetCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'c' in parsed &&
      'i' in parsed &&
      typeof (parsed as { c: unknown }).c === 'string' &&
      typeof (parsed as { i: unknown }).i === 'string'
    ) {
      const c = (parsed as { c: string }).c;
      const i = (parsed as { i: string }).i;
      if (Number.isNaN(Date.parse(c))) return null;
      return { createdAt: c, id: i };
    }
    return null;
  } catch {
    return null;
  }
}
