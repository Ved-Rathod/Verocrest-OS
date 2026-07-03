import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { decodeCursor, encodeCursor } from './cursor';
import { normalizeDomain } from './domain';
import {
  COMPANY_SELECT,
  companyRowSchema,
  toCompany,
  type Company,
  type CompanyPage,
} from './types';
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

export async function createCompany(ctx: WorkspaceContext, input: CompanyInput): Promise<Company> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('companies')
    .insert({
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
      created_by: ctx.userId,
      primary_owner_user_id: ctx.userId,
    })
    .select(COMPANY_SELECT)
    .single();

  if (error) throw error;
  return toCompany(companyRowSchema.parse(data));
}

export async function updateCompany(
  ctx: WorkspaceContext,
  id: string,
  input: CompanyInput,
): Promise<Company | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('companies')
    .update({
      name: input.name,
      domain: normalizeDomain(input.domain),
      website_url: input.websiteUrl ?? null,
      industry: input.industry ?? null,
      size: input.size ?? null,
      employee_count: input.employeeCount ?? null,
      description: input.description ?? null,
      tags: input.tags,
      is_client: input.isClient,
    })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .select(COMPANY_SELECT)
    .maybeSingle();

  if (error) throw error;
  return data ? toCompany(companyRowSchema.parse(data)) : null;
}

/** Soft delete per docs/04 §1.8 — sets deleted_at; no hard delete via authenticated. */
export async function softDeleteCompany(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('companies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

export { isDbError };
