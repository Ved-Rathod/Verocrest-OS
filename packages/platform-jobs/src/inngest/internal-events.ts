import type { MemoryScope } from '@verocrest/platform-ai-router';

/**
 * Internal infrastructure/job events (Sprint 3.4, decision D6 — the two-tier
 * model). These are Inngest-only: they are NOT part of the frozen business event
 * catalogue (docs/03 §8.3), NOT journaled to event_journal, and NOT reconciled.
 * They carry no business envelope — just the job payload the subscriber needs.
 *
 * Verified against the frozen blueprint: §8 defines "the bus" as business events
 * with the §8.2 envelope + §8.10 journaling; `memory.write.requested` appears only
 * in docs/09 §4.6 as a fire-and-forget Inngest signal, so keeping it out of the
 * journaled catalogue is an implementation clarification, not an amendment.
 */

export type MemoryWriteRequested = {
  workspaceId: string;
  scope: MemoryScope;
  subjectId: string | null;
  content: string;
  requestId: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
};

export type InternalEventSchema = {
  'memory.write.requested': { data: MemoryWriteRequested };
};
