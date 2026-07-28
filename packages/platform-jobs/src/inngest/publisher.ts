import {
  setEventPublisher,
  type EventEnvelope,
  type EventName,
  type EventPublisher,
} from '@verocrest/platform-event-bus';
import { recomputeQueueForLead } from '@verocrest/domain-outreach-queue/server';
import { inngest } from './client';
import { INDEX_DESCRIPTORS } from './indexing/registry';
import { indexEventNow } from './indexing/run';

/**
 * The concrete Inngest implementation of the provider-agnostic EventPublisher
 * interface (Sprint 3.2 decision #4). Maps an envelope to an Inngest event,
 * passing the ULID `id` as Inngest's idempotency/dedup key (docs/03 §8.7).
 *
 * Two INDEPENDENT deliveries per publish, neither allowed to block the other:
 *  - Fan-out to Inngest (async worker, production). In local dev with no worker /
 *    no INNGEST_EVENT_KEY this REJECTS — which must NOT skip inline indexing.
 *  - Inline indexing (self-contained completion) when the event is an indexer
 *    trigger and the service role is configured. Idempotent with the async worker.
 */
async function sendToInngest(envelope: EventEnvelope): Promise<void> {
  try {
    // name↔data pairing is correct at runtime; TS can't correlate the unions.
    await inngest.send({
      name: envelope.name,
      data: envelope,
      id: envelope.id,
      ts: Date.parse(envelope.occurredAt) || Date.now(),
    } as Parameters<typeof inngest.send>[0]);
  } catch (err) {
    // Best-effort: reconciliation/replay is the delivery safety net (docs/03 §8.7).
    // A send failure here must not abort inline indexing below.
    console.error(`[event-bus] inngest.send failed for ${envelope.name} (${envelope.id})`, err);
  }
}

async function indexInlineIfConfigured(envelope: EventEnvelope): Promise<void> {
  if (!INDEX_DESCRIPTORS[envelope.name as EventName]) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      `[INDEX ${envelope.name}] 3. Inline indexer: SKIPPED — SUPABASE_SERVICE_ROLE_KEY not set`,
    );
    return;
  }
  // indexEventNow logs every checkpoint and re-throws on failure (never hidden).
  await indexEventNow(envelope);
}

/**
 * Sprint 5.0 — recompute the Outreach Queue when a lead is (re)scored (docs/03 §8,
 * D6). Best-effort inline consumer, independent of indexing and the Inngest send:
 * a queue failure must not fail the user's request (manual "Recalculate" + the
 * async Inngest consumer are the safety net). Runs under the service role.
 */
async function recomputeQueueInline(envelope: EventEnvelope): Promise<void> {
  if (envelope.name !== 'lead.scored') return;
  const leadId = envelope.subject.id;
  if (!leadId) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(`[QUEUE ${leadId}] recompute SKIPPED — SUPABASE_SERVICE_ROLE_KEY not set`);
    return;
  }
  try {
    await recomputeQueueForLead({ workspaceId: envelope.workspaceId, leadId });
  } catch (err) {
    console.error(`[QUEUE] recompute failed for lead ${leadId}; recalculate to retry`, err);
  }
}

export const inngestPublisher: EventPublisher = {
  async publish(envelope: EventEnvelope): Promise<void> {
    // Step 2 — publish to the bus (best-effort). Runs first but cannot skip step 3.
    await sendToInngest(envelope);
    // Step 3+ — inline indexing, independent of the Inngest send outcome.
    await indexInlineIfConfigured(envelope);
    // Step 4 — Outreach Queue refresh on lead.scored, independent of the above.
    await recomputeQueueInline(envelope);
  },
};

/**
 * Wire the Inngest publisher into platform-event-bus. Idempotent; called once at
 * server startup (apps/web/instrumentation.ts) and by the replay CLI before it
 * emits.
 */
export function registerBusPublisher(): void {
  setEventPublisher(inngestPublisher);
}
