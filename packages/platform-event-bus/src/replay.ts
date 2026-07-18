import type { EventName, EventPayloads } from './catalogue';
import type { EventEnvelope } from './envelope';
import type { JournalEvent } from './journal';
import { publishToBus } from './publisher';

/**
 * Replay helpers (docs/03 §8.10). Reconstruct a publishable envelope from a
 * persisted journal row and re-emit it through the registered bus. The ULID `id`
 * is preserved verbatim so Inngest deduplicates any event already delivered —
 * this is what makes time-window reconciliation and the one-shot historical
 * backfill safe to run repeatedly (Sprint 3.2 decision #3).
 */
export function envelopeFromJournalEvent(e: JournalEvent): EventEnvelope {
  return {
    id: e.id,
    name: e.name as EventName,
    version: e.version,
    workspaceId: e.workspaceId,
    actor: { type: e.actorType, id: e.actorId },
    subject: { type: e.subjectType, id: e.subjectId },
    // Journal payloads are validated at write time against the catalogue; the
    // journal read widens them to a record, so we narrow back here.
    payload: e.payload as EventPayloads[EventName],
    occurredAt: e.occurredAt,
    emittedAt: e.emittedAt,
    correlationId: e.correlationId,
    causationId: e.causationId,
  };
}

/**
 * Re-emit a batch of journal rows in order. Returns the count published. Uses the
 * fire-and-forget {@link publishToBus} (never throws) so one bad row can't abort a
 * reconciliation run; idempotency makes the whole batch safe to retry.
 */
export async function replayEvents(events: JournalEvent[]): Promise<number> {
  let published = 0;
  for (const event of events) {
    await publishToBus(envelopeFromJournalEvent(event));
    published += 1;
  }
  return published;
}
