import {
  EVENT_SUBJECT_TYPE,
  EVENT_VERSIONS,
  type EventName,
  type EventPayloads,
} from './catalogue';
import { ulid } from './ulid';

/** Event envelope contract (docs/03 §8.2). Built entirely in the app; the DB only persists it. */
export type ActorType = 'user' | 'agent' | 'system' | 'integration';

export type EventActor = { type: ActorType; id: string };
export type EventSubject = { type: string; id: string | null };

export type EventEnvelope<N extends EventName = EventName> = {
  id: string; // ULID (idempotency key)
  name: N;
  version: number;
  workspaceId: string;
  actor: EventActor;
  subject: EventSubject;
  payload: EventPayloads[N];
  occurredAt: string; // ISO8601 — source of truth for ordering
  emittedAt: string; // ISO8601 — when serialized
  correlationId: string | null;
  causationId: string | null;
};

/**
 * Construct a typed event envelope. `version` and `subject.type` are derived from
 * the catalogue so callers can't drift from the contract; `id` is a fresh ULID and
 * `emittedAt` is now(). `subjectId` is the entity the event is about — for creates
 * the app generates the entity's uuid up front so the event can reference it.
 */
export function buildEvent<N extends EventName>(input: {
  name: N;
  workspaceId: string;
  actor: EventActor;
  subjectId: string | null;
  payload: EventPayloads[N];
  occurredAt?: string;
  correlationId?: string | null;
  causationId?: string | null;
}): EventEnvelope<N> {
  const now = new Date().toISOString();
  return {
    id: ulid(),
    name: input.name,
    version: EVENT_VERSIONS[input.name],
    workspaceId: input.workspaceId,
    actor: input.actor,
    subject: { type: EVENT_SUBJECT_TYPE[input.name], id: input.subjectId },
    payload: input.payload,
    occurredAt: input.occurredAt ?? now,
    emittedAt: now,
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
  };
}

/**
 * Flatten an envelope to the snake_case shape consumed by the atomic `*_with_event`
 * RPCs (keys map 1:1 to event_journal columns). This is the *only* serialization
 * the DB sees; it just `jsonb_populate_record`s it into the journal.
 */
export function journalRowFromEnvelope(e: EventEnvelope): Record<string, unknown> {
  return {
    id: e.id,
    workspace_id: e.workspaceId,
    name: e.name,
    version: e.version,
    actor_type: e.actor.type,
    actor_id: e.actor.id,
    subject_type: e.subject.type,
    subject_id: e.subject.id,
    payload: e.payload,
    correlation_id: e.correlationId,
    causation_id: e.causationId,
    occurred_at: e.occurredAt,
    emitted_at: e.emittedAt,
  };
}
