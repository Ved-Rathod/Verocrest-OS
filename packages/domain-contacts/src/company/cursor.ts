/**
 * Opaque keyset cursor for company lists (docs/10 §12.3): base64url of the last
 * row's (created_at, id). Pagination is (created_at desc, id desc), matching
 * idx_companies_ws_created_id. Tamper-tolerant: a malformed cursor decodes to
 * null and the query starts from the first page rather than erroring.
 */
export type CompanyCursor = { createdAt: string; id: string };

export function encodeCursor(cursor: CompanyCursor): string {
  const json = JSON.stringify({ c: cursor.createdAt, i: cursor.id });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): CompanyCursor | null {
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
