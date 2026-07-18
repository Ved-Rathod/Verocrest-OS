import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { REMINDER_ENTITY_LABELS, type ReminderEntityType } from './enums';
import type { Reminder, ReminderEntityRef } from './types';

/**
 * Polymorphic entity resolution for reminders (docs/04 §12). Reminders reference
 * a contact / lead / company with no DB FK, so this module reads those tables
 * READ-ONLY (scoped by workspace_id + RLS backstop) to (a) validate the target on
 * create, (b) power the create-form picker, and (c) hydrate display labels for a
 * page. This mirrors the established precedent of domain-leads reading contacts
 * read-only (resolveContactForLead); all WRITES stay in the owning domain.
 * 'deal' is structurally in the enum but has no table until Sprint 10 — treated
 * as unsupported here (empty search, no resolution).
 */

/** Lightweight option for the create-form entity picker. */
export type EntityOption = { id: string; label: string; sublabel: string | null };

export function entityHref(type: ReminderEntityType, id: string): string | null {
  switch (type) {
    case 'contact':
      return `/contacts/${id}`;
    case 'lead':
      return `/leads/${id}`;
    case 'company':
      return `/companies/${id}/edit`;
    case 'deal':
      return null; // Deals land Sprint 10
  }
}

function sanitizeSearch(term: string): string {
  return term
    .replace(/[,()%*\\]/g, ' ')
    .trim()
    .slice(0, 100);
}

function contactName(first: unknown, last: unknown, email: unknown): string {
  const name = [first, last]
    .filter((v): v is string => typeof v === 'string' && v !== '')
    .join(' ')
    .trim();
  return name || (typeof email === 'string' ? email : '') || 'Unnamed contact';
}

// PostgREST embeds a to-one relation as object or single-element array.
function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function makeRef(
  type: ReminderEntityType,
  id: string,
  label: string,
  sublabel: string | null,
): ReminderEntityRef {
  return { type, id, label, sublabel, href: entityHref(type, id), exists: true };
}

function missingRef(type: ReminderEntityType, id: string): ReminderEntityRef {
  return {
    type,
    id,
    label: `(${REMINDER_ENTITY_LABELS[type].toLowerCase()} unavailable)`,
    sublabel: null,
    href: null,
    exists: false,
  };
}

/**
 * Validate that the reminder target exists (and is not archived) in the workspace.
 * Returns a display ref on success, null if not found / unsupported type.
 */
export async function resolveEntity(
  ctx: WorkspaceContext,
  type: ReminderEntityType,
  id: string,
): Promise<ReminderEntityRef | null> {
  const supabase = await createSupabaseServerClient();

  if (type === 'contact') {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, primary_email, company_name')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return makeRef(
      'contact',
      data.id as string,
      contactName(data.first_name, data.last_name, data.primary_email),
      (data.primary_email as string | null) ?? (data.company_name as string | null) ?? null,
    );
  }

  if (type === 'company') {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, domain')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return makeRef(
      'company',
      data.id as string,
      data.name as string,
      (data.domain as string | null) ?? null,
    );
  }

  if (type === 'lead') {
    const { data, error } = await supabase
      .from('leads')
      .select('id, contact:contacts!inner(first_name, last_name, primary_email)')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const c = firstOf(data.contact as Record<string, unknown> | Record<string, unknown>[] | null);
    return makeRef(
      'lead',
      data.id as string,
      c ? contactName(c.first_name, c.last_name, c.primary_email) : 'Lead',
      c ? ((c.primary_email as string | null) ?? null) : null,
    );
  }

  return null; // deal — unsupported in v0.1
}

/** Typeahead search over one entity type for the create-form picker. */
export async function searchEntities(
  ctx: WorkspaceContext,
  type: ReminderEntityType,
  query: string,
  limit = 10,
): Promise<EntityOption[]> {
  const supabase = await createSupabaseServerClient();
  const term = sanitizeSearch(query);
  const cap = Math.min(limit, 25);

  if (type === 'contact') {
    let q = supabase
      .from('contacts')
      .select('id, first_name, last_name, primary_email, company_name')
      .eq('workspace_id', ctx.workspaceId)
      .is('deleted_at', null);
    if (term)
      q = q.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,primary_email.ilike.%${term}%,company_name.ilike.%${term}%`,
      );
    const { data, error } = await q.order('created_at', { ascending: false }).limit(cap);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      label: contactName(r.first_name, r.last_name, r.primary_email),
      sublabel: (r.primary_email as string | null) ?? (r.company_name as string | null) ?? null,
    }));
  }

  if (type === 'company') {
    let q = supabase
      .from('companies')
      .select('id, name, domain')
      .eq('workspace_id', ctx.workspaceId)
      .is('deleted_at', null);
    if (term) q = q.or(`name.ilike.%${term}%,domain.ilike.%${term}%`);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(cap);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      label: r.name as string,
      sublabel: (r.domain as string | null) ?? null,
    }));
  }

  if (type === 'lead') {
    let q = supabase
      .from('leads')
      .select('id, contact:contacts!inner(first_name, last_name, primary_email)')
      .eq('workspace_id', ctx.workspaceId)
      .is('deleted_at', null);
    if (term)
      q = q.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,primary_email.ilike.%${term}%`,
        { referencedTable: 'contact' },
      );
    const { data, error } = await q.order('created_at', { ascending: false }).limit(cap);
    if (error) throw error;
    return (data ?? []).map((r) => {
      const c = firstOf(r.contact as Record<string, unknown> | Record<string, unknown>[] | null);
      return {
        id: r.id as string,
        label: c ? contactName(c.first_name, c.last_name, c.primary_email) : 'Lead',
        sublabel: c ? ((c.primary_email as string | null) ?? null) : null,
      };
    });
  }

  return []; // deal
}

/** Batch-resolve display labels for a page of reminders (≤ 3 queries per page). */
export async function hydrateEntities(
  ctx: WorkspaceContext,
  reminders: Reminder[],
): Promise<Reminder[]> {
  if (reminders.length === 0) return reminders;
  const supabase = await createSupabaseServerClient();

  const ids: Record<ReminderEntityType, Set<string>> = {
    contact: new Set(),
    lead: new Set(),
    company: new Set(),
    deal: new Set(),
  };
  for (const r of reminders) ids[r.entityType].add(r.entityId);

  const refs = new Map<string, ReminderEntityRef>();
  const key = (t: ReminderEntityType, id: string) => `${t}:${id}`;

  if (ids.contact.size > 0) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, primary_email, company_name')
      .eq('workspace_id', ctx.workspaceId)
      .in('id', [...ids.contact]);
    if (error) throw error;
    for (const r of data ?? [])
      refs.set(
        key('contact', r.id as string),
        makeRef(
          'contact',
          r.id as string,
          contactName(r.first_name, r.last_name, r.primary_email),
          (r.primary_email as string | null) ?? (r.company_name as string | null) ?? null,
        ),
      );
  }

  if (ids.company.size > 0) {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, domain')
      .eq('workspace_id', ctx.workspaceId)
      .in('id', [...ids.company]);
    if (error) throw error;
    for (const r of data ?? [])
      refs.set(
        key('company', r.id as string),
        makeRef('company', r.id as string, r.name as string, (r.domain as string | null) ?? null),
      );
  }

  if (ids.lead.size > 0) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, contact:contacts!inner(first_name, last_name, primary_email)')
      .eq('workspace_id', ctx.workspaceId)
      .in('id', [...ids.lead]);
    if (error) throw error;
    for (const r of data ?? []) {
      const c = firstOf(r.contact as Record<string, unknown> | Record<string, unknown>[] | null);
      refs.set(
        key('lead', r.id as string),
        makeRef(
          'lead',
          r.id as string,
          c ? contactName(c.first_name, c.last_name, c.primary_email) : 'Lead',
          c ? ((c.primary_email as string | null) ?? null) : null,
        ),
      );
    }
  }

  return reminders.map((r) => ({
    ...r,
    entity: refs.get(key(r.entityType, r.entityId)) ?? missingRef(r.entityType, r.entityId),
  }));
}
