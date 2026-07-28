import { indexEntityIntoMemory } from '@verocrest/platform-ai-router/server';
import {
  buildEvent,
  journalRowFromEnvelope,
  publishToBus,
  type EventEnvelope,
  type EventName,
} from '@verocrest/platform-event-bus';
import { createSupabaseServiceRoleClient } from '@verocrest/platform-integrations/supabase/service';
import { INDEX_DESCRIPTORS } from './registry';

/**
 * The Knowledge Indexer core (docs/09 §5.2–5.4), shared by the async Inngest
 * function and the publisher's inline path ({@link indexEventNow}). Every stage
 * logs a PASS/FAIL checkpoint; on failure it prints the full exception (stack +
 * Postgres/Supabase code/message/details/hint), the table being written, and the
 * env var in play — then re-throws (never hides the exception).
 */

type IndexLogger = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
};

const consoleLogger: IndexLogger = {
  info: (m, meta) => console.info(m, meta ?? ''),
  warn: (m, meta) => console.warn(m, meta ?? ''),
};

export type IndexResult = { subjectId?: string; chunkCount?: number; skipped?: boolean };

function ck(event: string, subjectId: string | null, step: number, label: string): void {
  console.info(`[INDEX ${event} ${subjectId ?? '-'}] ${step}. ${label}: PASS`);
}

/** Print everything the operator needs, then re-throw (do not hide). */
function reportFailure(
  event: string,
  subjectId: string | null,
  step: number,
  label: string,
  table: string,
  err: unknown,
): never {
  const e = err as {
    message?: string;
    stack?: string;
    code?: string;
    details?: string;
    hint?: string;
  };
  console.error(`[INDEX ${event} ${subjectId ?? '-'}] ${step}. ${label}: FAIL`, {
    message: e.message,
    pgCode: e.code,
    pgDetails: e.details,
    pgHint: e.hint,
    table,
    envUsed: 'SUPABASE_SERVICE_ROLE_KEY',
    serviceKeyPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseUrlPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    stack: e.stack,
  });
  throw err;
}

export async function indexEventNow(
  envelope: EventEnvelope,
  logger: IndexLogger = consoleLogger,
): Promise<IndexResult> {
  const name = envelope.name;
  const descriptor = INDEX_DESCRIPTORS[name as EventName];
  if (!descriptor) {
    logger.warn('no index descriptor for event; skipping', { name });
    return { skipped: true };
  }

  const workspaceId = envelope.workspaceId;
  const subjectId = envelope.subject.id;
  if (!subjectId) {
    logger.warn('trigger event without subject id; skipping', { id: envelope.id });
    return { skipped: true };
  }

  ck(name, subjectId, 1, 'Entity saved (trigger event committed)');
  ck(name, subjectId, 3, 'Inline indexer entered');

  // Step 4 — service-role client.
  let supabase;
  try {
    supabase = createSupabaseServiceRoleClient();
    ck(name, subjectId, 4, 'createSupabaseServiceRoleClient()');
  } catch (err) {
    reportFailure(name, subjectId, 4, 'createSupabaseServiceRoleClient()', '(none)', err);
  }

  let query = supabase
    .from(descriptor.table)
    .select(descriptor.selectColumns)
    .eq('id', subjectId)
    .eq('workspace_id', workspaceId);
  if (descriptor.softDelete !== false) query = query.is('deleted_at', null);
  const { data: row, error: readError } = await query.maybeSingle();
  if (readError) reportFailure(name, subjectId, 4, 'read source row', descriptor.table, readError);
  if (!row) {
    logger.warn('entity not found for indexing', { table: descriptor.table, subjectId });
    return { skipped: true };
  }
  const entity = row as unknown as Record<string, unknown>;

  // Steps 5–6 — embedding + writeMemory (inside indexEntityIntoMemory, which logs them).
  let indexed;
  try {
    indexed = await indexEntityIntoMemory({
      workspaceId,
      scope: descriptor.scope,
      subjectId,
      sourceText: descriptor.buildSourceText(entity),
      sourceContentHash: String(entity['content_hash']),
      embedCapability: descriptor.embedCapability,
      actor: { type: 'system', id: 'knowledge-indexer' },
      requestId: envelope.id,
      metadataBase: descriptor.metadataBase(entity),
    });
  } catch (err) {
    reportFailure(name, subjectId, 6, 'embedding + writeMemory', 'memory_vectors', err);
  }
  const { chunkCount, chunks } = indexed;

  if (descriptor.afterIndex) {
    try {
      await descriptor.afterIndex({ workspaceId, subjectId, row: entity, chunks });
      ck(name, subjectId, 6, 'afterIndex (chunk tracking)');
    } catch (err) {
      reportFailure(name, subjectId, 6, 'afterIndex', 'knowledge_document_chunks', err);
    }
  }

  const indexedEvent = buildEvent({
    name: descriptor.indexedEventName,
    workspaceId,
    actor: { type: 'system', id: 'knowledge-indexer' },
    subjectId,
    payload: descriptor.buildIndexedPayload(entity, chunkCount),
    correlationId: envelope.correlationId ?? envelope.id,
  } as Parameters<typeof buildEvent>[0]);

  // Step 7 — flip is_indexed + journal, one transaction.
  const { error: markError } = await supabase.rpc(descriptor.setIndexedRpc, {
    p_id: subjectId,
    p_workspace: workspaceId,
    p_event: journalRowFromEnvelope(indexedEvent),
  });
  if (markError)
    reportFailure(name, subjectId, 7, descriptor.setIndexedRpc, descriptor.table, markError);
  ck(name, subjectId, 7, `update is_indexed=true (${descriptor.setIndexedRpc})`);
  ck(name, subjectId, 8, 'transaction committed');

  await publishToBus(indexedEvent);
  logger.info('entity indexed', { scope: descriptor.scope, subjectId, chunkCount });
  return { subjectId, chunkCount };
}
