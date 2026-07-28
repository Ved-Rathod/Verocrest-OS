import type { EventEnvelope } from '@verocrest/platform-event-bus';
import { inngest } from '../client';
import { INDEXER_TRIGGER_EVENTS } from '../indexing/registry';
import { indexEventNow } from '../indexing/run';

/**
 * Knowledge Indexer (docs/09 §5.2–5.4, roadmap SPRINT 6 item 4). Descriptor-driven
 * (Sprint 4.2 decision D2): subscribes to every Knowledge-Layer trigger event,
 * looks up the entity's recipe in the registry, chunks + embeds its source text
 * into memory_vectors with the two-phase swap, flips `is_indexed`, and emits the
 * matching `*.indexed`. The indexing core is shared with the publisher's inline
 * path ({@link indexEventNow}); this is the async (production) entry point. Runs
 * under the service role. Adding an entity type = a registry row, not a new function.
 */
export const knowledgeIndexer = inngest.createFunction(
  { id: 'knowledge-indexer', name: 'Knowledge indexer' },
  INDEXER_TRIGGER_EVENTS.map((event) => ({ event })),
  async ({ event, logger }) => indexEventNow(event.data as EventEnvelope, logger),
);
