import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { icpContentHash } from './hash';
import { ICP_SELECT, icpRowSchema, toIcp, type Icp, type IcpListItem } from './types';
import { buildCriteria, type IcpInput } from './validation';

/**
 * ICP repository (docs/04 §5.7, docs/05 §3.3). Server-only; explicit
 * WorkspaceContext; workspace_id scoping with RLS backstop. Save-and-activate
 * emits `icp.upserted` atomically (create/update RPC) then fans out post-commit
 * so the Knowledge Indexer subscribes and vectorizes the narrative (scope 'icp').
 */

export async function listIcps(ctx: WorkspaceContext): Promise<IcpListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('icps')
    .select('id, name, short_description, active, is_primary, is_indexed, updated_at')
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    shortDescription: (r.short_description as string | null) ?? null,
    active: Boolean(r.active),
    isPrimary: Boolean(r.is_primary),
    isIndexed: Boolean(r.is_indexed),
    updatedAt: r.updated_at as string,
  }));
}

export async function getIcp(ctx: WorkspaceContext, id: string): Promise<Icp | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('icps')
    .select(ICP_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toIcp(icpRowSchema.parse(data)) : null;
}

async function hasActiveIcp(ctx: WorkspaceContext): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from('icps')
    .select('id', { head: true, count: 'exact' })
    .eq('workspace_id', ctx.workspaceId)
    .eq('active', true)
    .is('deleted_at', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function createIcp(ctx: WorkspaceContext, input: IcpInput): Promise<Icp> {
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const criteria = buildCriteria(input);
  const contentHash = icpContentHash(input.narrative, criteria);
  // First active ICP in the workspace becomes primary (docs/04 §5.7 uq index).
  const isPrimary = !(await hasActiveIcp(ctx));

  const event = buildEvent({
    name: 'icp.upserted',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { icp_id: id, version: 1 },
  });
  const { data, error } = await supabase.rpc('create_icp_with_event', {
    p_icp: {
      id,
      workspace_id: ctx.workspaceId,
      name: input.name,
      short_description: input.shortDescription || null,
      narrative: input.narrative,
      criteria,
      match_weights: {},
      disqualifiers: input.disqualifiers,
      target_geographies: input.targetGeographies,
      target_industries: input.targetIndustries,
      target_size: input.targetSize,
      target_revenue_min: input.targetRevenueMin ?? null,
      target_revenue_max: input.targetRevenueMax ?? null,
      target_revenue_currency: input.targetRevenueCurrency ?? null,
      active: true,
      is_primary: isPrimary,
      version: 1,
      content_hash: contentHash,
      created_by: ctx.userId,
    },
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  const icp = toIcp(icpRowSchema.parse(data));
  await publishToBus(event); // fan out → Knowledge Indexer (docs/10 §11.3)
  return icp;
}

export async function updateIcp(
  ctx: WorkspaceContext,
  id: string,
  input: IcpInput,
): Promise<Icp | null> {
  const supabase = await createSupabaseServerClient();
  const { data: current, error: readError } = await supabase
    .from('icps')
    .select('content_hash, is_indexed, is_primary, version')
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) return null;

  const criteria = buildCriteria(input);
  const contentHash = icpContentHash(input.narrative, criteria);
  // Only force a re-index when the indexed content actually changed (docs/09 §5.4).
  const contentChanged = contentHash !== (current.content_hash as string);
  const isIndexed = contentChanged ? false : Boolean(current.is_indexed);

  const event = buildEvent({
    name: 'icp.upserted',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { icp_id: id, version: current.version as number },
  });
  const { data, error } = await supabase.rpc('update_icp_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_icp: {
      name: input.name,
      short_description: input.shortDescription || null,
      narrative: input.narrative,
      criteria,
      match_weights: {},
      disqualifiers: input.disqualifiers,
      target_geographies: input.targetGeographies,
      target_industries: input.targetIndustries,
      target_size: input.targetSize,
      target_revenue_min: input.targetRevenueMin ?? null,
      target_revenue_max: input.targetRevenueMax ?? null,
      target_revenue_currency: input.targetRevenueCurrency ?? null,
      active: true,
      is_primary: current.is_primary as boolean,
      content_hash: contentHash,
      is_indexed: isIndexed,
    },
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  if (!data) return null;
  const icp = toIcp(icpRowSchema.parse(data));
  await publishToBus(event);
  return icp;
}
