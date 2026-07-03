import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { decodeCursor, encodeCursor } from '../company/cursor';
import {
  CONTACT_DETAIL_SELECT,
  CONTACT_SELECT,
  contactDetailRowSchema,
  contactRowSchema,
  toContact,
  toContactDetail,
  type Contact,
  type ContactDetail,
  type ContactPage,
} from './types';
import type { ContactInput, ContactListParams } from './validation';

/**
 * Contact repository (docs/06 §3, docs/10 §6.2). Server-only. Explicit
 * WorkspaceContext; queries scoped by workspace_id with RLS as the backstop.
 * The company link (companyId + authoritative companyName) is resolved by the
 * caller (actions) and passed in, keeping this layer free of cross-lookups.
 */

export type CompanyLink = { companyId: string | null; companyName: string | null };

function sanitizeSearch(term: string): string {
  return term
    .replace(/[,()%*\\]/g, ' ')
    .trim()
    .slice(0, 100);
}

function phonesFrom(input: ContactInput): { label: string; number: string }[] {
  return input.phone ? [{ label: 'primary', number: input.phone }] : [];
}

export async function listContacts(
  ctx: WorkspaceContext,
  params: ContactListParams,
): Promise<ContactPage> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null);

  if (params.search) {
    const term = sanitizeSearch(params.search);
    if (term) {
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,primary_email.ilike.%${term}%,company_name.ilike.%${term}%`,
      );
    }
  }
  if (params.isClient === 'clients') query = query.eq('is_client', true);
  if (params.isClient === 'prospects') query = query.eq('is_client', false);
  if (params.companyId) query = query.eq('company_id', params.companyId);

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

  const rows = (data ?? []).map((r) => toContact(contactRowSchema.parse(r)));
  const hasMore = rows.length > params.pageSize;
  const items = hasMore ? rows.slice(0, params.pageSize) : rows;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

  return { items, nextCursor };
}

export async function getContactDetail(
  ctx: WorkspaceContext,
  id: string,
): Promise<ContactDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('contacts')
    .select(CONTACT_DETAIL_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data ? toContactDetail(contactDetailRowSchema.parse(data)) : null;
}

export async function createContact(
  ctx: WorkspaceContext,
  input: ContactInput,
  link: CompanyLink,
): Promise<Contact> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      workspace_id: ctx.workspaceId,
      company_id: link.companyId,
      company_name: link.companyName,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      primary_email: input.primaryEmail ?? null,
      phones: phonesFrom(input),
      role_title: input.roleTitle ?? null,
      seniority: input.seniority ?? null,
      is_decision_maker: input.isDecisionMaker,
      website_url: input.websiteUrl ?? null,
      linkedin_url: input.linkedinUrl ?? null,
      notes: input.notes ?? null,
      tags: input.tags,
      is_client: input.isClient,
      created_by: ctx.userId,
    })
    .select(CONTACT_SELECT)
    .single();

  if (error) throw error;
  return toContact(contactRowSchema.parse(data));
}

export async function updateContact(
  ctx: WorkspaceContext,
  id: string,
  input: ContactInput,
  link: CompanyLink,
): Promise<Contact | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('contacts')
    .update({
      company_id: link.companyId,
      company_name: link.companyName,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      primary_email: input.primaryEmail ?? null,
      phones: phonesFrom(input),
      role_title: input.roleTitle ?? null,
      seniority: input.seniority ?? null,
      is_decision_maker: input.isDecisionMaker,
      website_url: input.websiteUrl ?? null,
      linkedin_url: input.linkedinUrl ?? null,
      notes: input.notes ?? null,
      tags: input.tags,
      is_client: input.isClient,
    })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .select(CONTACT_SELECT)
    .maybeSingle();

  if (error) throw error;
  return data ? toContact(contactRowSchema.parse(data)) : null;
}

export async function softDeleteContact(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('contacts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}
