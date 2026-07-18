import { EventSchemas, Inngest } from 'inngest';
import type { EventEnvelope, EventName } from '@verocrest/platform-event-bus';
import type { InternalEventSchema } from './internal-events';

/**
 * Typed bus event map: each catalogue event carries its full {@link EventEnvelope}
 * as `data`. This binds Inngest function triggers to the frozen catalogue (docs/03
 * §8.2–8.3) so subscribers get compile-time-checked payloads.
 */
type BusEventSchema = {
  [K in EventName]: { data: EventEnvelope<K> };
};

/**
 * The Inngest client knows both tiers (decision D6): journaled BUSINESS events
 * (BusEventSchema) and Inngest-only INTERNAL job events (InternalEventSchema).
 * Only business events flow through event_journal + reconciliation; internal
 * events are ephemeral.
 */
type AllEventSchema = BusEventSchema & InternalEventSchema;

/**
 * The single Inngest client for the app (docs/10 §3.4). `id` identifies the app
 * to Inngest. Event/signing keys are read by the SDK from the environment
 * (INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY, docs/12 §3); the local Inngest dev
 * server needs neither.
 */
export const inngest = new Inngest({
  id: 'verocrest-os',
  schemas: new EventSchemas().fromRecord<AllEventSchema>(),
});
