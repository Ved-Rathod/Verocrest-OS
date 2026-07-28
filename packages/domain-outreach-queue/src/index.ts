// @verocrest/domain-outreach-queue — client-safe surface (types + labels).
// Server data access is in './server'; the Server Action in './actions'.
// Materialized next-best-action queue for the LIE (docs/04 §8.1; Sprint 5.0;
// Amendment 012).
export { QUEUE_VERSION } from './queue/nba';
export {
  NEXT_BEST_ACTION_LABELS,
  type QueueItem,
  type QueueReasoning,
  type NextBestAction,
  type PriorityBasis,
  type RecomputeOutcome,
} from './queue/types';
