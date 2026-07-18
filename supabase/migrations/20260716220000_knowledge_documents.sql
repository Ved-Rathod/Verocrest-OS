-- Sprint 4.3: Knowledge Documents (docs/04 §7.3–7.5). Third Knowledge-Layer
-- entity; markdown content is chunked + embedded into memory_vectors (scope
-- 'knowledge_doc') AND tracked in knowledge_document_chunks (char offsets +
-- version + memory_vector_id) for the version-precise two-phase swap.
-- Forward-only. Same atomic *_with_event pattern.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'knowledge_doc_type_enum') then
    create type public.knowledge_doc_type_enum as enum (
      'sop', 'offer_narrative', 'pricing_note', 'case_study', 'testimonial',
      'faq', 'onboarding', 'sales_playbook', 'brand_voice', 'legal_terms',
      'objection_handling', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'knowledge_doc_visibility_enum') then
    create type public.knowledge_doc_visibility_enum as enum ('internal', 'client_shareable');
  end if;
end $$;

create table if not exists public.knowledge_documents (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  doc_type              public.knowledge_doc_type_enum not null,
  title                 text not null,
  slug                  citext,
  summary               text,
  content               text not null,
  content_rich          jsonb,
  tags                  text[] not null default '{}',
  linked_entity_type    text,
  linked_entity_id      uuid,
  visibility            public.knowledge_doc_visibility_enum not null default 'internal',
  version               integer not null default 1,
  is_indexed            boolean not null default false,
  last_indexed_at       timestamptz,
  content_hash          text not null,
  author_user_id        uuid references auth.users(id),
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create index if not exists idx_knowledge_documents_ws_type_active
  on public.knowledge_documents (workspace_id, doc_type) where active = true and deleted_at is null;
create index if not exists idx_knowledge_documents_ws_tags
  on public.knowledge_documents using gin (tags); -- single-column gin (no btree_gin dep)
create unique index if not exists uq_knowledge_documents_ws_slug
  on public.knowledge_documents (workspace_id, slug) where slug is not null and deleted_at is null;
create index if not exists idx_knowledge_documents_ws_content_hash
  on public.knowledge_documents (workspace_id, content_hash);
create index if not exists idx_knowledge_documents_ws_linked
  on public.knowledge_documents (workspace_id, linked_entity_type, linked_entity_id)
  where linked_entity_id is not null;

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_documents force row level security;
drop policy if exists knowledge_documents_tenant_select on public.knowledge_documents;
create policy knowledge_documents_tenant_select on public.knowledge_documents for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists knowledge_documents_tenant_insert on public.knowledge_documents;
create policy knowledge_documents_tenant_insert on public.knowledge_documents for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
drop policy if exists knowledge_documents_tenant_update on public.knowledge_documents;
create policy knowledge_documents_tenant_update on public.knowledge_documents for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- 7.4 chunk-tracking table (LIE — written by the service-role indexer).
create table if not exists public.knowledge_document_chunks (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  knowledge_document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index           integer not null,
  content               text not null,
  char_start            integer not null,
  char_end              integer not null,
  memory_vector_id      uuid references public.memory_vectors(id) on delete set null,
  content_hash          text not null,
  doc_version_at_index  integer not null,
  created_at            timestamptz not null default now()
);

create unique index if not exists uq_knowledge_document_chunks_doc_idx
  on public.knowledge_document_chunks (knowledge_document_id, chunk_index);
create index if not exists idx_knowledge_document_chunks_ws_doc
  on public.knowledge_document_chunks (workspace_id, knowledge_document_id);
create index if not exists idx_knowledge_document_chunks_hash
  on public.knowledge_document_chunks (knowledge_document_id, content_hash);

alter table public.knowledge_document_chunks enable row level security;
alter table public.knowledge_document_chunks force row level security;
drop policy if exists knowledge_document_chunks_tenant_select on public.knowledge_document_chunks;
create policy knowledge_document_chunks_tenant_select on public.knowledge_document_chunks for select to authenticated
  using (public.is_workspace_member(workspace_id));
-- Writes come only from the service-role Knowledge Indexer (bypasses RLS).

-- knowledge_doc.upserted fires on every save (docs/05 §3.5 — no draft gating).
create or replace function public.create_knowledge_doc_with_event(p_doc jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.knowledge_documents;
begin
  insert into public.knowledge_documents (
    id, workspace_id, doc_type, title, slug, summary, content, content_rich, tags,
    linked_entity_type, linked_entity_id, visibility, version, content_hash, author_user_id, active
  ) select id, workspace_id, doc_type, title, slug, summary, content, content_rich, tags,
    linked_entity_type, linked_entity_id, visibility, version, content_hash, author_user_id, active
    from jsonb_populate_record(null::public.knowledge_documents, p_doc) returning * into v;
  perform public._persist_domain_event(p_event, v.workspace_id, v.id, array['knowledge_doc.upserted']);
  return to_jsonb(v);
end $$;

create or replace function public.update_knowledge_doc_with_event(
  p_id uuid, p_workspace uuid, p_doc jsonb, p_event jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.knowledge_documents;
begin
  update public.knowledge_documents c set
    doc_type=s.doc_type, title=s.title, slug=s.slug, summary=s.summary, content=s.content,
    content_rich=s.content_rich, tags=s.tags, linked_entity_type=s.linked_entity_type,
    linked_entity_id=s.linked_entity_id, visibility=s.visibility, content_hash=s.content_hash,
    is_indexed=s.is_indexed, version=s.version, active=s.active, updated_at=now()
  from jsonb_populate_record(null::public.knowledge_documents, p_doc) s
  where c.id=p_id and c.workspace_id=p_workspace and c.deleted_at is null
  returning c.* into v;
  if not found then return null; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['knowledge_doc.upserted']);
  return to_jsonb(v);
end $$;

create or replace function public.set_knowledge_doc_indexed_with_event(
  p_id uuid, p_workspace uuid, p_event jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.knowledge_documents set is_indexed=true, last_indexed_at=now()
    where id=p_id and workspace_id=p_workspace and deleted_at is null;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['knowledge_doc.indexed']);
  return true;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('create_knowledge_doc_with_event','update_knowledge_doc_with_event','set_knowledge_doc_indexed_with_event')
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
