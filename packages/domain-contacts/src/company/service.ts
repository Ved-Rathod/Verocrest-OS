import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { decodeCursor, encodeCursor } from './cursor';
import { normalizeDomain } from './domain';
import {
  COMPANY_SELECT,
  companyRowSchema,
  contactRefName,
  toCompany,
  type Company,
  type CompanyContactRef,
  type CompanyDetail,
  type CompanyPage,
} from './types';
import type { CustomFieldValues } from '../custom-fields/types';
import type { CompanyInput, CompanyListParams } from './validation';

/**
 * Company repository (docs/06 §3, docs/10 §6.1). Server-only. Every function
 * takes an explicit WorkspaceContext (docs/10 §3.3 — no ambient globals) and
 * scopes queries by workspace_id; RLS is the backstop (docs/03 §4).
 *
 * Errors are thrown as Postgres/PostgREST error objects and mapped to canonical
 * ActionErrors by the caller (actions.ts) via mapCompanyDbError.
 */

type DbError = { code?: string; message?: string };

function isDbError(e: unknown): e is DbError {
  return typeof e === 'object' && e !== null && ('code' in e || 'message' in e);
}

/** PostgREST or()-grammar is comma/paren delimited; strip chars that would break it. */
function sanitizeSearch(term: string): string {
  return term
    .replace(/[,()%*\\]/g, ' ')
    .trim()
    .slice(0, 100);
}

export async function listCompanies(
  ctx: WorkspaceContext,
  params: CompanyListParams,
): Promise<CompanyPage> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('companies')
    .select(COMPANY_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null);

  if (params.search) {
    const term = sanitizeSearch(params.search);
    if (term) query = query.or(`name.ilike.%${term}%,domain.ilike.%${term}%`);
  }
  if (params.isClient === 'clients') query = query.eq('is_client', true);
  if (params.isClient === 'prospects') query = query.eq('is_client', false);
  if (params.size) query = query.eq('size', params.size);
  if (params.industry) query = query.eq('industry', params.industry);

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

  const rows = (data ?? []).map((r) => toCompany(companyRowSchema.parse(r)));
  const hasMore = rows.length > params.pageSize;
  const items = hasMore ? rows.slice(0, params.pageSize) : rows;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

  return { items, nextCursor };
}

/** Lightweight company options for the contact company-picker (docs/06 §3.9). */
export type CompanyOption = { id: string; name: string; domain: string | null };

export async function searchCompanies(
  ctx: WorkspaceContext,
  query: string,
  limit = 10,
): Promise<CompanyOption[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('companies')
    .select('id, name, domain')
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null);

  const term = sanitizeSearch(query);
  if (term) q = q.or(`name.ilike.%${term}%,domain.ilike.%${term}%`);

  const { data, error } = await q.order('name', { ascending: true }).limit(Math.min(limit, 25));
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    domain: (r.domain as string | null) ?? null,
  }));
}

export async function getCompany(ctx: WorkspaceContext, id: string): Promise<Company | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('companies')
    .select(COMPANY_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data ? toCompany(companyRowSchema.parse(data)) : null;
}

/**
 * Company detail = the company + a contacts count (docs/10 §6.1.3). Deals/audits
 * counts are 0 in v0.1 (tables land later) — surfaced as gated placeholders in UI.
 */
export async function getCompanyDetail(
  ctx: WorkspaceContext,
  id: string,
): Promise<CompanyDetail | null> {
  const company = await getCompany(ctx, id);
  if (!company) return null;

  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ctx.workspaceId)
    .eq('company_id', id)
    .is('deleted_at', null);
  if (error) throw error;

  return { ...company, contactCount: count ?? 0, viewerIsOwner: ctx.role === 'owner' };
}

/** Contacts linked to a company (docs/06 §3 detail — "contacts at this company"). */
export async function listCompanyContacts(
  ctx: WorkspaceContext,
  companyId: string,
  limit = 100,
): Promise<CompanyContactRef[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, primary_email, role_title, is_decision_maker')
    .eq('workspace_id', ctx.workspaceId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('is_decision_maker', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 200));
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: contactRefName(
      r.first_name as string | null,
      r.last_name as string | null,
      r.primary_email as string | null,
    ),
    email: (r.primary_email as string | null) ?? null,
    roleTitle: (r.role_title as string | null) ?? null,
    isDecisionMaker: Boolean(r.is_decision_maker),
  }));
}

/**
 * Merge a duplicate company (source) into a survivor (target) — atomic, owner-only,
 * workspace-scoped (docs/10 §6.1.7). All integrity work happens inside the
 * merge_companies() rpc (one transaction); this just invokes it and shapes the
 * result. Errors (owner/same/not-found/cross-workspace) are raised as named
 * sentinels and mapped by mapMergeError in the action.
 */
export type MergeResult = { movedContacts: number; movedLeads: number };

export async function mergeCompanies(
  ctx: WorkspaceContext,
  sourceId: string,
  targetId: string,
): Promise<MergeResult> {
  const supabase = await createSupabaseServerClient();
  const event = buildEvent({
    name: 'company.merged',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: sourceId,
    payload: { source_company_id: sourceId, target_company_id: targetId },
  });
  const { data, error } = await supabase.rpc('merge_companies_with_event', {
    p_source: sourceId,
    p_target: targetId,
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)

  const row = Array.isArray(data) ? data[0] : data;
  return {
    movedContacts: Number(row?.moved_contacts ?? 0),
    movedLeads: Number(row?.moved_leads ?? 0),
  };
}

export async function createCompany(
  ctx: WorkspaceContext,
  input: CompanyInput,
  customFields: CustomFieldValues = {},
): Promise<Company> {
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const event = buildEvent({
    name: 'company.created',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { company_id: id },
  });
  const { data, error } = await supabase.rpc('create_company_with_event', {
    p_company: {
      id,
      workspace_id: ctx.workspaceId,
      name: input.name,
      domain: normalizeDomain(input.domain),
      website_url: input.websiteUrl ?? null,
      industry: input.industry ?? null,
      size: input.size ?? null,
      employee_count: input.employeeCount ?? null,
      description: input.description ?? null,
      tags: input.tags,
      is_client: input.isClient,
      custom_fields: customFields,
      created_by: ctx.userId,
      primary_owner_user_id: ctx.userId,
    },
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  const company = toCompany(companyRowSchema.parse(data));
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return company;
}

export async function updateCompany(
  ctx: WorkspaceContext,
  id: string,
  input: CompanyInput,
  customFields: CustomFieldValues = {},
): Promise<Company | null> {
  const supabase = await createSupabaseServerClient();
  const event = buildEvent({
    name: 'company.updated',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: {
      company_id: id,
      changed_fields: [
        'name',
        'domain',
        'website_url',
        'industry',
        'size',
        'employee_count',
        'description',
        'tags',
        'is_client',
        'custom_fields',
      ],
    },
  });
  const { data, error } = await supabase.rpc('update_company_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_company: {
      name: input.name,
      domain: normalizeDomain(input.domain),
      website_url: input.websiteUrl ?? null,
      industry: input.industry ?? null,
      size: input.size ?? null,
      employee_count: input.employeeCount ?? null,
      description: input.description ?? null,
      tags: input.tags,
      is_client: input.isClient,
      custom_fields: customFields,
    },
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (!data) return null;
  const company = toCompany(companyRowSchema.parse(data));
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return company;
}

/** Soft delete per docs/04 §1.8 — sets deleted_at; no hard delete via authenticated. */
export async function softDeleteCompany(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const archivedAt = new Date().toISOString();
  const event = buildEvent({
    name: 'company.archived',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { company_id: id, archived_at: archivedAt },
    occurredAt: archivedAt,
  });
  const { data, error } = await supabase.rpc('archive_company_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (data !== true) return false;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return true;
}

export { isDbError };
