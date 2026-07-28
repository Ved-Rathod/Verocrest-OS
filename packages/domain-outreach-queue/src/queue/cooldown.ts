import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import { createSupabaseServiceRoleClient } from '@verocrest/platform-integrations/supabase/service';

/**
 * Apply a cooldown to a lead's queue item (Sprint 5.0, D3). Snooze/Complete on the
 * queue are realized as a follow-up reminder (system of record) PLUS this
 * service-role cooldown, which drops the item out of the active queue until it
 * elapses. Runs under the service role (the queue is write-locked); callers
 * authorize workspace membership first. Emits `outreach.queue.updated`.
 */
export async function applyQueueCooldown(params: {
  workspaceId: string;
  leadId: string;
  until: Date;
}): Promise<boolean> {
  const { workspaceId, leadId, until } = params;
  const supabase = createSupabaseServiceRoleClient();

  const event = buildEvent({
    name: 'outreach.queue.updated',
    workspaceId,
    actor: { type: 'system', id: 'outreach-queue' },
    subjectId: leadId,
    payload: { lead_id: leadId, added: 0, removed: 1, reordered: 0 },
  });

  const { data, error } = await supabase.rpc('set_queue_cooldown_with_event', {
    p_workspace: workspaceId,
    p_lead: leadId,
    p_until: until.toISOString(),
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  if (data === false) return false;

  await publishToBus(event);
  return true;
}
