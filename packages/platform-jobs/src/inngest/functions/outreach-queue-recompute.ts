import type { EventEnvelope } from '@verocrest/platform-event-bus';
import { recomputeQueueForLead } from '@verocrest/domain-outreach-queue/server';
import { inngest } from '../client';

/**
 * Outreach Queue recompute (Sprint 5.0, docs/03 §6.5, §8; roadmap S7 item 5). The
 * async (production) counterpart of the publisher's inline path: subscribes to
 * `lead.scored`, recomputes that lead's queue item + reranks the workspace, and
 * emits `outreach.queue.updated`. Runs under the service role. Additional frozen
 * triggers (`relationship.profile.recomputed` S7, `outreach.sent` S9) subscribe
 * here when their producers land — no rework.
 */
export const outreachQueueRecompute = inngest.createFunction(
  { id: 'outreach-queue-recompute', name: 'Outreach queue recompute' },
  { event: 'lead.scored' },
  async ({ event }) => {
    const envelope = event.data as EventEnvelope;
    const leadId = envelope.subject.id;
    if (!leadId) return { skipped: true };
    return recomputeQueueForLead({ workspaceId: envelope.workspaceId, leadId });
  },
);
