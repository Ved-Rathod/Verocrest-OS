import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { decodeCursor, encodeCursor } from './cursor';
import {
  LEAD_DETAIL_SELECT,
  LEAD_SELECT,
  leadDetailRowSchema,
  leadRowSchema,
  toLead,
  toLeadDetail,
  type Lead,
  type LeadDetail,
  type LeadPage,
} from './types';
import type { LeadInput, LeadListParams } from './validation';

/**
 * Lead repository (docs/06 §3, docs/10 §6.3, amended docs/04 §5.1). Server-only;
 * explicit WorkspaceContext; workspace_id scoping with RLS backstop.
 *
 * Contact FK resolution: resolveContactForLead reads the contacts table
 * READ-ONLY to validate the required contact and derive company_id (Amendment
 * 001 — company derives from the contact). Module 2 spans contacts + leads
 * (docs/06 §3.8); all WRITES to contacts stay in domain-contacts.
 */

export type ResolvedContact = {
  id: string;
  companyId: string | null;
};

export async function resolveContactForLead(
  ctx: WorkspaceContext,
  contactId: string,
): Promise<ResolvedContact | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('id, company_id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', contactId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, companyId: (data.company_id as string | null) ?? null };
}

function sanitizeSearch(term: string): string {
  return term
    .replace(/[,()%*\\]/g, ' ')
    .trim()
    .slice(0, 100);
}

export async function listLeads(ctx: WorkspaceContext, params: LeadListParams): Promise<LeadPage> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null);

  if (params.search) {
    const term = sanitizeSearch(params.search);
    if (term) {
      // Search the embedded contact (name/email/company cache). The !inner
      // embed in LEAD_SELECT makes this narrow the lead rows.
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,primary_email.ilike.%${term}%,company_name.ilike.%${term}%`,
        { referencedTable: 'contact' },
      );
    }
  }
  if (params.status) query = query.eq('status', params.status);
  if (params.priority) query = query.eq('priority', params.priority);

  const cursor = decodeCursor(params.cursor);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  query = query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(params.pageSize + 1);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((r) => toLead(leadRowSchema.parse(r)));
  const hasMore = rows.length > params.pageSize;
  const items = hasMore ? rows.slice(0, params.pageSize) : rows;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

  return { items, nextCursor };
}

export async function getLeadDetail(ctx: WorkspaceContext, id: string): Promise<LeadDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_DETAIL_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data ? toLeadDetail(leadDetailRowSchema.parse(data)) : null;
}

function statusSideEffects(input: LeadInput): Record<string, unknown> {
  // Entering 'disqualified' stamps the timestamp + reason; any other status
  // clears them (docs/04 §5.1; qualified_at automation is LIE-owned, Sprint 7).
  if (input.status === 'disqualified') {
    return {
      disqualified_at: new Date().toISOString(),
      disqualified_reason: input.disqualifiedReason ?? null,
    };
  }
  return { disqualified_at: null, disqualified_reason: null };
}

// Mutable columns shared by create + edit. owner_user_id is intentionally NOT
// here: ownership is set once at creation and must survive edits — otherwise any
// member editing another member's lead would silently steal ownership. company_id
// re-derives from the contact on every write (Amendment 001).
function leadColumns(input: LeadInput, contact: ResolvedContact) {
  return {
    contact_id: contact.id,
    company_id: contact.companyId, // Amendment 001: company derives from contact
    status: input.status,
    priority: input.priority ?? null,
    source: input.source ?? null,
    estimated_value: input.estimatedValue ?? null,
    currency: input.currency ?? null,
    expected_close_date: input.expectedCloseDate ?? null,
    notes: input.notes ?? null,
    tags: input.tags,
    ...statusSideEffects(input),
  };
}

export async function createLead(
  ctx: WorkspaceContext,
  input: LeadInput,
  contact: ResolvedContact,
): Promise<Lead> {
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const event = buildEvent({
    name: 'lead.ingested',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { source: input.source ?? null, raw_data: {}, dedupe_key: contact.id },
  });
  const { data, error } = await supabase.rpc('create_lead_with_event', {
    p_lead: {
      id,
      workspace_id: ctx.workspaceId,
      owner_user_id: ctx.userId, // insert-only; preserved across later edits
      ...leadColumns(input, contact),
    },
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (!data) throw new Error('create_lead_with_event returned no row');
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  const created = await getLeadDetail(ctx, id);
  if (!created) throw new Error('created lead could not be read');
  return created;
}

export async function updateLead(
  ctx: WorkspaceContext,
  id: string,
  input: LeadInput,
  contact: ResolvedContact,
): Promise<Lead | null> {
  const supabase = await createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from('leads')
    .select('status')
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;

  const previousStatus = current.status as string;
  const statusChanged = previousStatus !== input.status;
  const event = statusChanged
    ? buildEvent({
        name: 'lead.status_changed',
        workspaceId: ctx.workspaceId,
        actor: { type: 'user', id: ctx.userId },
        subjectId: id,
        payload: { lead_id: id, previous_status: previousStatus, next_status: input.status },
      })
    : buildEvent({
        name: 'lead.updated',
        workspaceId: ctx.workspaceId,
        actor: { type: 'user', id: ctx.userId },
        subjectId: id,
        payload: {
          lead_id: id,
          changed_fields: [
            'contact_id',
            'company_id',
            'priority',
            'source',
            'estimated_value',
            'currency',
            'expected_close_date',
            'notes',
            'tags',
            'disqualified_at',
            'disqualified_reason',
          ],
        },
      });
  const { data, error } = await supabase.rpc('update_lead_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_expected_status: previousStatus,
    p_lead: leadColumns(input, contact),
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (!data) return null;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return getLeadDetail(ctx, id);
}

/** Archive (soft delete) per docs/04 §1.8. */
export async function softDeleteLead(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const archivedAt = new Date().toISOString();
  const event = buildEvent({
    name: 'lead.archived',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { lead_id: id, archived_at: archivedAt },
    occurredAt: archivedAt,
  });
  const { data, error } = await supabase.rpc('archive_lead_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (data !== true) return false;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return true;
}

export function isDbError(e: unknown): e is { code?: string; message?: string } {
  return typeof e === 'object' && e !== null && ('code' in e || 'message' in e);
}
