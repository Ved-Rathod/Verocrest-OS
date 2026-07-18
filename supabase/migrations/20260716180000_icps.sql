-- Sprint 4.1: Ideal Customer Profiles (docs/04 §5.7). First Knowledge-Layer
-- entity; its narrative is chunked + embedded into memory_vectors (scope 'icp')
-- by the Knowledge Indexer. Forward-only. Same atomic *_with_event pattern as CRM.

create table if not exists public.icps (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  name              text not null,
  short_description text,
  narrative         text not null,
  criteria          jsonb not null,
  match_weights     jsonb not null default '{}'::jsonb,
  disqualifiers     jsonb not null default '[]'::jsonb,
  target_geographies text[] not null default '{}',
  target_industries text[] not null default '{}',
  target_size       public.company_size_enum[] not null default '{}',
  target_revenue_min numeric(18,4),
  target_revenue_max numeric(18,4),
  target_revenue_currency char(3),
  active            boolean not null default true,
  is_primary        boolean not null default false,
  version           integer not null default 1,
  is_indexed        boolean not null default false,
  last_indexed_at   timestamptz,
  content_hash      text not null,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create unique index if not exists uq_icps_ws_primary_active
  on public.icps (workspace_id) where is_primary = true and active = true and deleted_at is null;
create unique index if not exists uq_icps_ws_name_version
  on public.icps (workspace_id, name, version) where deleted_at is null;
create index if not exists idx_icps_ws_active
  on public.icps (workspace_id, active) where deleted_at is null;
create index if not exists idx_icps_ws_industries
  on public.icps using gin (target_industries);
create index if not exists idx_icps_ws_geographies
  on public.icps using gin (target_geographies);

alter table public.icps enable row level security;
alter table public.icps force row level security;
drop policy if exists icps_tenant_select on public.icps;
create policy icps_tenant_select on public.icps for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists icps_tenant_insert on public.icps;
create policy icps_tenant_insert on public.icps for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
drop policy if exists icps_tenant_update on public.icps;
create policy icps_tenant_update on public.icps for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Create + emit icp.upserted atomically (docs/10 §11.1). Business event, journaled.
create or replace function public.create_icp_with_event(p_icp jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.icps;
begin
  insert into public.icps (
    id, workspace_id, name, short_description, narrative, criteria, match_weights,
    disqualifiers, target_geographies, target_industries, target_size,
    target_revenue_min, target_revenue_max, target_revenue_currency,
    active, is_primary, version, content_hash, created_by
  ) select id, workspace_id, name, short_description, narrative, criteria, match_weights,
    disqualifiers, target_geographies, target_industries, target_size,
    target_revenue_min, target_revenue_max, target_revenue_currency,
    active, is_primary, version, content_hash, created_by
    from jsonb_populate_record(null::public.icps, p_icp) returning * into v;
  perform public._persist_domain_event(p_event, v.workspace_id, v.id, array['icp.upserted']);
  return to_jsonb(v);
end $$;

-- Update + emit icp.upserted. Re-index detection: caller sets is_indexed=false when
-- content_hash changed (the indexer re-embeds only when it did).
create or replace function public.update_icp_with_event(
  p_id uuid, p_workspace uuid, p_icp jsonb, p_event jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.icps;
begin
  update public.icps c set
    name=s.name, short_description=s.short_description, narrative=s.narrative,
    criteria=s.criteria, match_weights=s.match_weights, disqualifiers=s.disqualifiers,
    target_geographies=s.target_geographies, target_industries=s.target_industries,
    target_size=s.target_size, target_revenue_min=s.target_revenue_min,
    target_revenue_max=s.target_revenue_max, target_revenue_currency=s.target_revenue_currency,
    active=s.active, is_primary=s.is_primary, content_hash=s.content_hash,
    is_indexed=s.is_indexed, updated_at=now()
  from jsonb_populate_record(null::public.icps, p_icp) s
  where c.id=p_id and c.workspace_id=p_workspace and c.deleted_at is null
  returning c.* into v;
  if not found then return null; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['icp.upserted']);
  return to_jsonb(v);
end $$;

-- Mark indexed + emit icp.indexed. Called by the service-role indexer; the event
-- carries a 'system' actor (auth.uid() is null under the service role).
create or replace function public.set_icp_indexed_with_event(
  p_id uuid, p_workspace uuid, p_event jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.icps set is_indexed=true, last_indexed_at=now()
    where id=p_id and workspace_id=p_workspace and deleted_at is null;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['icp.indexed']);
  return true;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('create_icp_with_event','update_icp_with_event','set_icp_indexed_with_event')
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
