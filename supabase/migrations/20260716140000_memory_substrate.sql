-- Sprint 3.4: Memory + Embeddings substrate (docs/04 §7.1–7.2, docs/09 §4–5).
-- Forward-only. Vector store + HNSW ANN + RLS-scoped retrieval RPC.
-- Knowledge Layer (knowledge_documents, chunks) is Sprint 6 — NOT created here.

create extension if not exists vector;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'memory_scope_enum') then
    create type public.memory_scope_enum as enum (
      'workspace', 'company', 'contact', 'lead', 'deal',
      'project', 'audit', 'knowledge_doc', 'offer', 'icp'
    );
  end if;
end $$;

create table if not exists public.memory_vectors (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  scope         public.memory_scope_enum not null,
  subject_id    uuid,                                   -- null when scope = 'workspace'
  agent_id      text,                                   -- null in v0.1
  content_hash  text not null,
  content       text not null,
  embedding     vector(1536) not null,
  metadata      jsonb not null default '{}'::jsonb,
  ttl_at        timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_memory_vectors_ws_scope_subject
  on public.memory_vectors (workspace_id, scope, subject_id);
create index if not exists idx_memory_vectors_ws_hash
  on public.memory_vectors (workspace_id, content_hash);
create index if not exists idx_memory_vectors_ttl
  on public.memory_vectors (ttl_at) where ttl_at is not null;
create index if not exists idx_memory_vectors_embedding_hnsw
  on public.memory_vectors using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.memory_vectors enable row level security;
alter table public.memory_vectors force row level security;
drop policy if exists memory_vectors_tenant_select on public.memory_vectors;
create policy memory_vectors_tenant_select on public.memory_vectors for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists memory_vectors_tenant_insert on public.memory_vectors;
create policy memory_vectors_tenant_insert on public.memory_vectors for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
-- Writes come from the service-role memory-writer subscriber (RLS-bypassing); the
-- INSERT policy above is the defense-in-depth path for any in-request member write.
-- Re-index deletes (Sprint 6) run as service role. No member UPDATE/DELETE policy.

create table if not exists public.memory_annotations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  memory_id     uuid not null references public.memory_vectors(id) on delete cascade,
  annotation    text not null,                          -- 'always_apply' | 'never_apply' | 'boost' | 'suppress'
  capability    text,
  actor_user_id uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_memory_annotations_memory
  on public.memory_annotations (memory_id);
create index if not exists idx_memory_annotations_ws_capability
  on public.memory_annotations (workspace_id, capability);

alter table public.memory_annotations enable row level security;
alter table public.memory_annotations force row level security;
drop policy if exists memory_annotations_tenant_select on public.memory_annotations;
create policy memory_annotations_tenant_select on public.memory_annotations for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists memory_annotations_tenant_insert on public.memory_annotations;
create policy memory_annotations_tenant_insert on public.memory_annotations for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

-- Cosine ANN retrieval (docs/09 §4.4). SECURITY INVOKER: the caller's RLS scopes
-- the search to their workspace; the explicit workspace filter matches the pattern
-- used across every table (we never adopted the app.workspace_id GUC — decision D7).
-- Oversamples (top_k * 3) so app-side annotation filtering (docs/09 §4.5) still
-- yields top_k. The embedding arrives as a pgvector text literal ('[0.1,0.2,...]').
create or replace function public.match_memory(
  p_workspace uuid,
  p_scopes public.memory_scope_enum[],
  p_subject_ids uuid[],
  p_query_embedding text,
  p_top_k integer,
  p_min_similarity double precision
) returns table (
  id uuid,
  scope public.memory_scope_enum,
  subject_id uuid,
  content text,
  metadata jsonb,
  agent_id text,
  similarity double precision
) language sql stable security invoker set search_path = public, pg_temp as $$
  select m.id, m.scope, m.subject_id, m.content, m.metadata, m.agent_id,
         1 - (m.embedding <=> p_query_embedding::vector) as similarity
  from public.memory_vectors m
  where m.workspace_id = p_workspace
    and m.scope = any(p_scopes)
    and (p_subject_ids is null or m.subject_id = any(p_subject_ids) or m.subject_id is null)
    and (m.ttl_at is null or m.ttl_at > now())
    and (1 - (m.embedding <=> p_query_embedding::vector)) >= p_min_similarity
  order by m.embedding <=> p_query_embedding::vector
  limit greatest(p_top_k * 3, 1);
$$;

revoke all on function public.match_memory(uuid, public.memory_scope_enum[], uuid[], text, integer, double precision) from public;
grant execute on function public.match_memory(uuid, public.memory_scope_enum[], uuid[], text, integer, double precision) to authenticated;
