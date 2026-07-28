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

/**
 * Registry holder kept on `globalThis`, NOT a module-level `let`. Next.js runs
 * the instrumentation hook and the request/Server-Action handlers in SEPARATE
 * module graphs within the SAME JS realm/process, so a module-level singleton
 * mutated by instrumentation is invisible to the Server Action's copy of this
 * module — the exact bug that dropped every event onto the no-op. `globalThis`
 * is shared across all those module graphs, so registration and lookup resolve
 * the one instance. The holder is created lazily at first access and the
 * publisher is read at publish time, so there is no import-evaluation-order
 * dependency (an unregistered bus is a no-op, never a crash).
 */
type PublisherRegistry = { publisher: EventPublisher; registered: boolean };
const REGISTRY_KEY = Symbol.for('@verocrest/platform-event-bus:publisher-registry');

function registry(): PublisherRegistry {
  const holder = globalThis as unknown as Record<symbol, PublisherRegistry | undefined>;
  return (holder[REGISTRY_KEY] ??= { publisher: noopPublisher, registered: false });
}

/** Register the concrete publisher. Called once at server startup (instrumentation). */
export function setEventPublisher(publisher: EventPublisher): void {
  const r = registry();
  r.publisher = publisher;
  r.registered = true;
}

/** True once a real (non-noop) publisher is registered. */
export function hasEventPublisher(): boolean {
  return registry().registered;
}

/** Test-only: restore the unregistered state. */
export function resetEventPublisherForTests(): void {
  const r = registry();
  r.publisher = noopPublisher;
  r.registered = false;
}

/**
 * Fire-and-forget emit, called from the domain service *after* the atomic RPC
 * commits (docs/10 §11.3; Sprint 3.2 decision #2 — never from Server Actions or
 * triggers). Never throws: the state change is already durable and journaled, and
 * nightly reconciliation (time-window replay, idempotent on the envelope ULID) is
 * the delivery safety net (docs/03 §8.7). A publish failure must not fail the
 * user's request. The publisher is resolved from the process-global registry at
 * call time (see {@link registry}).
 */
export async function publishToBus(envelope: EventEnvelope): Promise<void> {
  const r = registry();
  try {
    await r.publisher.publish(envelope);
  } catch (err) {
    console.error(
      `[event-bus] publish failed for ${envelope.name} (${envelope.id}); reconciliation will retry`,
      err,
    );
  }
}
