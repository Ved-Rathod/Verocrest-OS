import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import type { NextBestAction, QueueItem, QueueReasoning } from './types';

/**
 * RLS-scoped member reads of the materialized queue. The "active" list hides items
 * in cooldown or past expiry; ordering is by the LIE-computed `priority_rank`.
 */

const QUEUE_SELECT =
  'lead_id, contact_id, company_id, recommended_offer_id, opportunity_score, next_best_action, channel_preference, reasoning, cooldown_until, priority_rank, computed_at, expires_at, contact:contacts(first_name, last_name), company:companies(name), offer:offers(name)';

type QueueRow = Record<string, unknown> & {
  contact?: { first_name?: string | null; last_name?: string | null } | null;
  company?: { name?: string | null } | null;
  offer?: { name?: string | null } | null;
};

function toQueueItem(row: QueueRow): QueueItem {
  const contact = row.contact ?? null;
  const contactName =
    [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() || 'the contact';
  return {
    leadId: row['lead_id'] as string,
    contactId: row['contact_id'] as string,
    companyId: (row['company_id'] as string | null) ?? null,
    contactName,
    companyName: row.company?.name ?? null,
    recommendedOfferId: (row['recommended_offer_id'] as string | null) ?? null,
    recommendedOfferName: row.offer?.name ?? null,
    opportunityScore: (row['opportunity_score'] as number | null) ?? null,
    nextBestAction: row['next_best_action'] as NextBestAction,
    channelPreference: (row['channel_preference'] as string | null) ?? null,
    reasoning: row['reasoning'] as QueueReasoning,
    cooldownUntil: (row['cooldown_until'] as string | null) ?? null,
    priorityRank: row['priority_rank'] as number,
    computedAt: row['computed_at'] as string,
    expiresAt: row['expires_at'] as string,
  };
}

/** Active queue (not cooled-down, not expired), ranked. */
export async function listQueue(ctx: WorkspaceContext, limit = 50): Promise<QueueItem[]> {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('outreach_queue_items')
    .select(QUEUE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .gt('expires_at', nowIso)
    .or(`cooldown_until.is.null,cooldown_until.lte.${nowIso}`)
    .order('priority_rank', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toQueueItem(r as QueueRow));
}

/** A single lead's queue item (regardless of cooldown), or null. */
export async function getQueueItem(
  ctx: WorkspaceContext,
  leadId: string,
): Promise<QueueItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('outreach_queue_items')
    .select(QUEUE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data ? toQueueItem(data as QueueRow) : null;
}
