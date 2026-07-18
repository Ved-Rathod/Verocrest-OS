import { createHash } from 'node:crypto';

/**
 * Re-index detector (docs/04 §5.7): SHA-256 of narrative + criteria. Server-only
 * (node:crypto) — kept OUT of the client-safe barrel so it never reaches the
 * browser bundle. Used by the ICP service to detect content changes.
 */
export function icpContentHash(narrative: string, criteria: Record<string, unknown>): string {
  return createHash('sha256')
    .update(`${narrative}\n${JSON.stringify(criteria)}`)
    .digest('hex');
}
