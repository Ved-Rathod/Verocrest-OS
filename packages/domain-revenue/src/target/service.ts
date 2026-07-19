import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { targetContentHash } from './hash';
import {
  TARGET_SELECT,
  isCurrent,
  targetRowSchema,
  toTarget,
  type Target,
  type TargetListItem,
} from './types';
import type { TargetInput } from './validation';

/**
 * Revenue Targets repository (docs/04 §13.2, docs/05 §3.6). Server-only; explicit
 * WorkspaceContext; RLS backstop. Every save emits the frozen `target.set` event,
 * which the Knowledge Indexer consumes to vectorize the target fact (scope
 * 'workspace'). v0.1 stores targets only — attainment lands with Deals (Sprint 10).
 */

export async function listTargets(ctx: WorkspaceContext): Promise<TargetListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('workspace_targets')
    .select('id, period, period_start, period_end, revenue_target, currency, is_indexed')
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null)
    .order('period_start', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    period: r.period as TargetListItem['period'],
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    revenueTarget: Number(r.revenue_target ?? 0),
    currency: r.currency as string,
    isIndexed: Boolean(r.is_indexed),
  }));
}

export async function getTarget(ctx: WorkspaceContext, id: string): Promise<Target | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('workspace_targets')
    .select(TARGET_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toTarget(targetRowSchema.parse(data)) : null;
}

/** Targets whose period contains today — the "current"/active targets (D5). */
export async function getCurrentTargets(ctx: WorkspaceContext): Promise<Target[]> {
  return (await listFull(ctx)).filter((t) => isCurrent(t));
}

async function listFull(ctx: WorkspaceContext): Promise<Target[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('workspace_targets')
    .select(TARGET_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null)
    .order('period_start', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => toTarget(targetRowSchema.parse(r)));
}

function targetFields(input: TargetInput, contentHash: string) {
  return {
    period: input.period,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    revenue_target: input.revenueTarget,
    currency: input.currency,
    meetings_target: input.meetingsTarget ?? null,
    reply_rate_target: input.replyRateTarget ?? null,
    content_hash: contentHash,
  };
}

export async function createTarget(ctx: WorkspaceContext, input: TargetInput): Promise<Target> {
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const contentHash = targetContentHash(input);

  const event = buildEvent({
    name: 'target.set',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { target_id: id, period: input.period },
  });
  const { data, error } = await supabase.rpc('set_target_with_event', {
    p_target: {
      id,
      workspace_id: ctx.workspaceId,
      ...targetFields(input, contentHash),
      created_by: ctx.userId,
    },
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  const target = toTarget(targetRowSchema.parse(data));
  await publishToBus(event); // fan out → Knowledge Indexer
  return target;
}

export async function updateTarget(
  ctx: WorkspaceContext,
  id: string,
  input: TargetInput,
): Promise<Target | null> {
  const supabase = await createSupabaseServerClient();
  const { data: current, error: readError } = await supabase
    .from('workspace_targets')
    .select('content_hash, is_indexed')
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return null;

  const contentHash = targetContentHash(input);
  const contentChanged = contentHash !== (current.content_hash as string);
  const isIndexed = contentChanged ? false : Boolean(current.is_indexed);

  const event = buildEvent({
    name: 'target.set',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { target_id: id, period: input.period },
  });
  const { data, error } = await supabase.rpc('update_target_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_target: { ...targetFields(input, contentHash), is_indexed: isIndexed },
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  if (!data) return null;
  const target = toTarget(targetRowSchema.parse(data));
  await publishToBus(event);
  return target;
}

export async function deleteTarget(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('workspace_targets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
