import { indexEntityIntoMemory } from '@verocrest/platform-ai-router/server';
import {
  buildEvent,
  journalRowFromEnvelope,
  publishToBus,
  type EventName,
} from '@verocrest/platform-event-bus';
import { createSupabaseServiceRoleClient } from '@verocrest/platform-integrations/supabase/service';
import { inngest } from '../client';
import { INDEXER_TRIGGER_EVENTS, INDEX_DESCRIPTORS } from '../indexing/registry';

/**
 * Knowledge Indexer (docs/09 §5.2–5.4, roadmap SPRINT 6 item 4). Descriptor-driven
 * (Sprint 4.2 decision D2): subscribes to every Knowledge-Layer `*.upserted`
 * business event, looks up the entity's recipe in the registry, chunks + embeds
 * its source text into memory_vectors with the two-phase swap, flips `is_indexed`,
 * and emits the matching `*.indexed`. Runs under the service role; the indexed
 * event carries a SYSTEM actor (the atomic RPC rejects a 'user' actor when
 * auth.uid() is null). Adding an entity type = a registry row, not a new function.
 */
export const knowledgeIndexer = inngest.createFunction(
  { id: 'knowledge-indexer', name: 'Knowledge indexer' },
  INDEXER_TRIGGER_EVENTS.map((event) => ({ event })),
  async ({ event, logger }) => {
    const descriptor = INDEX_DESCRIPTORS[event.name as EventName];
    if (!descriptor) {
      logger.warn('no index descriptor for event; skipping', { name: event.name });
      return { skipped: true };
    }

    const workspaceId = event.data.workspaceId;
    const subjectId = event.data.subject.id;
    if (!subjectId) {
      logger.warn('upserted event without subject id; skipping', { id: event.data.id });
      return { skipped: true };
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data: row, error } = await supabase
      .from(descriptor.table)
      .select(descriptor.selectColumns)
      .eq('id', subjectId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      logger.warn('entity not found for indexing', { table: descriptor.table, subjectId });
      return { skipped: true };
    }
    const entity = row as unknown as Record<string, unknown>;

    const { chunkCount, chunks } = await indexEntityIntoMemory({
      workspaceId,
      scope: descriptor.scope,
      subjectId,
      sourceText: descriptor.buildSourceText(entity),
      sourceContentHash: String(entity['content_hash']),
      embedCapability: descriptor.embedCapability,
      actor: { type: 'system', id: 'knowledge-indexer' },
      requestId: event.data.id, // correlate to the triggering event
      metadataBase: descriptor.metadataBase(entity),
    });

    // Chunk-tracking hook (KB docs only; docs/04 §7.5). ICP/Offer have no hook.
    if (descriptor.afterIndex) {
      await descriptor.afterIndex({ workspaceId, subjectId, row: entity, chunks });
    }

    // name↔payload are matched by the descriptor at runtime; TS can't correlate
    // the union, so we cast to the buildEvent input type.
    const indexedEvent = buildEvent({
      name: descriptor.indexedEventName,
      workspaceId,
      actor: { type: 'system', id: 'knowledge-indexer' },
      subjectId,
      payload: descriptor.buildIndexedPayload(entity, chunkCount),
      correlationId: event.data.correlationId ?? event.data.id,
    } as Parameters<typeof buildEvent>[0]);

    const { error: markError } = await supabase.rpc(descriptor.setIndexedRpc, {
      p_id: subjectId,
      p_workspace: workspaceId,
      p_event: journalRowFromEnvelope(indexedEvent),
    });
    if (markError) throw markError;
    await publishToBus(indexedEvent);

    logger.info('entity indexed', { scope: descriptor.scope, subjectId, chunkCount });
    return { subjectId, chunkCount };
  },
);
