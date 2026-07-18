import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
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
import type { CustomFieldValues } from '../custom-fields/types';
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

/** Lightweight contact options for pickers (e.g. lead creation, docs/06 §3). */
export type ContactOption = {
  id: string;
  name: string;
  email: string | null;
  companyName: string | null;
};

export async function searchContacts(
  ctx: WorkspaceContext,
  query: string,
  limit = 10,
): Promise<ContactOption[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('contacts')
    .select('id, first_name, last_name, primary_email, company_name')
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null);

  const term = sanitizeSearch(query);
  if (term) {
    q = q.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,primary_email.ilike.%${term}%,company_name.ilike.%${term}%`,
    );
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 25));
  if (error) throw error;

  return (data ?? []).map((r) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
    return {
      id: r.id as string,
      name: name || (r.primary_email as string | null) || 'Unnamed contact',
      email: (r.primary_email as string | null) ?? null,
      companyName: (r.company_name as string | null) ?? null,
    };
  });
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
  customFields: CustomFieldValues = {},
): Promise<Contact> {
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const event = buildEvent({
    name: 'contact.created',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { contact_id: id },
  });
  const { data, error } = await supabase.rpc('create_contact_with_event', {
    p_contact: {
      id,
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
      custom_fields: customFields,
      created_by: ctx.userId,
    },
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  const contact = toContact(contactRowSchema.parse(data));
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return contact;
}

export async function updateContact(
  ctx: WorkspaceContext,
  id: string,
  input: ContactInput,
  link: CompanyLink,
  customFields: CustomFieldValues = {},
): Promise<Contact | null> {
  const supabase = await createSupabaseServerClient();
  const event = buildEvent({
    name: 'contact.updated',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: {
      changed_fields: [
        'company_id',
        'company_name',
        'first_name',
        'last_name',
        'primary_email',
        'phones',
        'role_title',
        'seniority',
        'is_decision_maker',
        'website_url',
        'linkedin_url',
        'notes',
        'tags',
        'is_client',
        'custom_fields',
      ],
    },
  });
  const { data, error } = await supabase.rpc('update_contact_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_contact: {
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
      custom_fields: customFields,
    },
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (!data) return null;
  const contact = toContact(contactRowSchema.parse(data));
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return contact;
}

export async function softDeleteContact(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const archivedAt = new Date().toISOString();
  const event = buildEvent({
    name: 'contact.archived',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { contact_id: id, archived_at: archivedAt },
    occurredAt: archivedAt,
  });
  const { data, error } = await supabase.rpc('archive_contact_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (data !== true) return false;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return true;
}
