import { createHash } from 'node:crypto';

/**
 * Content hash of the indexed audit summary (Sprint 4.8). Server-only
 * (node:crypto). The indexer keys memory dedup on this, so it must change iff the
 * embedded summary changes.
 */
export function auditContentHash(summary: string): string {
  return createHash('sha256').update(summary).digest('hex');
}
