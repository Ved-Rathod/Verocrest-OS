import { createHash } from 'node:crypto';

/**
 * Knowledge-document re-index detector (docs/04 §7.3 — SHA-256 of content;
 * changes invalidate the chunk index). Server-only (node:crypto), kept OUT of
 * the client-safe barrel. The indexed content IS the markdown `content`.
 */
export function knowledgeDocContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
