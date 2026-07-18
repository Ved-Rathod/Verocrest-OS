/**
 * Opaque keyset cursor for the reminders list — ordered (due_at asc, id asc) so
 * the soonest-due reminders surface first (Follow-ups semantics, docs/06 §6).
 * Malformed cursors decode to null (first page). Intentionally duplicated from
 * the other domains (cross-domain imports are forbidden, 03 §5); consolidates
 * into platform-db when that package lands.
 */
export type KeysetCursor = { dueAt: string; id: string };

export function encodeCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify({ d: cursor.dueAt, i: cursor.id });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): KeysetCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'd' in parsed &&
      'i' in parsed &&
      typeof (parsed as { d: unknown }).d === 'string' &&
      typeof (parsed as { i: unknown }).i === 'string'
    ) {
      const d = (parsed as { d: string }).d;
      const i = (parsed as { i: string }).i;
      if (Number.isNaN(Date.parse(d))) return null;
      return { dueAt: d, id: i };
    }
    return null;
  } catch {
    return null;
  }
}
