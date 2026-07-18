import { createHash } from 'node:crypto';
import type { OfferInput } from './validation';

/**
 * Offer re-index detector (docs/04 §10.6). Server-only (node:crypto) — kept OUT
 * of the client-safe barrel. Hashes exactly the fields the Knowledge Indexer
 * embeds (positioning + roi_narrative + deliverables + guarantees, docs/04 §10.7),
 * so `is_indexed` resets iff the embedded content changed — pricing/targeting
 * edits don't trigger a needless re-embed.
 */
export function offerContentHash(input: OfferInput): string {
  const indexed = {
    positioning: input.positioning ?? '',
    roiNarrative: input.roiNarrative ?? '',
    deliverables: input.deliverables,
    guarantees: input.guarantees,
  };
  return createHash('sha256').update(JSON.stringify(indexed)).digest('hex');
}
