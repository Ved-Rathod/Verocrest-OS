import { createHash } from 'node:crypto';
import type { TargetInput } from './validation';

/**
 * Re-index detector (docs/04 §13.2, Sprint 4.7). Server-only (node:crypto) — kept
 * OUT of the client barrel. Hashes exactly the fields the indexer turns into the
 * memory fact (period + amount + currency + range), so `is_indexed` resets iff the
 * indexed fact changed.
 */
export function targetContentHash(input: TargetInput): string {
  const indexed = {
    period: input.period,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    revenueTarget: input.revenueTarget,
    currency: input.currency,
  };
  return createHash('sha256').update(JSON.stringify(indexed)).digest('hex');
}
