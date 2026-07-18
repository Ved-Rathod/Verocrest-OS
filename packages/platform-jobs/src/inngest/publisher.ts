import {
  setEventPublisher,
  type EventEnvelope,
  type EventPublisher,
} from '@verocrest/platform-event-bus';
import { inngest } from './client';

/**
 * The concrete Inngest implementation of the provider-agnostic EventPublisher
 * interface (Sprint 3.2 decision #4). Maps an envelope to an Inngest event,
 * passing the ULID `id` as Inngest's idempotency/dedup key (docs/03 §8.7) so
 * reconciliation and replay never double-deliver.
 */
export const inngestPublisher: EventPublisher = {
  async publish(envelope: EventEnvelope): Promise<void> {
    // The envelope's name↔data pairing is correct at runtime, but TypeScript can't
    // correlate the two unions, so we cast to the send payload type.
    await inngest.send({
      name: envelope.name,
      data: envelope,
      id: envelope.id,
      ts: Date.parse(envelope.occurredAt) || Date.now(),
    } as Parameters<typeof inngest.send>[0]);
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
