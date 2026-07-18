import type { EventEnvelope } from './envelope';

/**
 * Provider-agnostic bus publisher (docs/03 §8). The concrete implementation
 * (Inngest) lives in @verocrest/platform-jobs and is registered once at server
 * startup via {@link setEventPublisher}. platform-event-bus never imports a
 * runtime SDK — it owns the catalogue, envelope, publisher *interface*, and
 * replay helpers only (Sprint 3.2 decision #4).
 */
export interface EventPublisher {
  publish(envelope: EventEnvelope): Promise<void>;
}

/** Default until a runtime registers. Events are still durably journaled by the
 *  atomic RPC; a real publisher fans them out. */
const noopPublisher: EventPublisher = {
  async publish() {
    /* no-op */
  },
};

let current: EventPublisher = noopPublisher;

/** Register the concrete publisher. Called once at server startup (instrumentation). */
export function setEventPublisher(publisher: EventPublisher): void {
  current = publisher;
}

/** True once a real (non-noop) publisher is registered. */
export function hasEventPublisher(): boolean {
  return current !== noopPublisher;
}

/** Test-only: restore the unregistered state. */
export function resetEventPublisherForTests(): void {
  current = noopPublisher;
}

/**
 * Fire-and-forget emit, called from the domain service *after* the atomic RPC
 * commits (docs/10 §11.3; Sprint 3.2 decision #2 — never from Server Actions or
 * triggers). Never throws: the state change is already durable and journaled, and
 * nightly reconciliation (time-window replay, idempotent on the envelope ULID) is
 * the delivery safety net (docs/03 §8.7). A publish failure must not fail the
 * user's request. Awaited so the send is initiated before a serverless function
 * can freeze the event loop.
 */
export async function publishToBus(envelope: EventEnvelope): Promise<void> {
  try {
    await current.publish(envelope);
  } catch (err) {
    console.error(
      `[event-bus] publish failed for ${envelope.name} (${envelope.id}); reconciliation will retry`,
      err,
    );
  }
}
