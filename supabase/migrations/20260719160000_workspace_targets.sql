-- Sprint 4.7: Revenue Targets (docs/04 §13.2, docs/05 §3.6). Implements the FROZEN
-- workspace_targets table verbatim, plus three additive indexing columns
-- (is_indexed / last_indexed_at / content_hash) so the shared Knowledge Indexer can
-- vectorize each target into AI Memory (scope 'workspace') — see Amendment 008.
-- v0.1 stores targets only; live attainment lands with Deals (Sprint 10). Forward-only.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'target_period_enum') then
    create type public.target_period_enum as enum ('monthly', 'quarterly', 'annual');
  end if;
end $$;

create table if not exists public.workspace_targets (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  period            public.target_period_enum not null,
  period_start      date not null,
  period_end        date not null,
  revenue_target    numeric(18,4) not null,
  currency          char(3) not null,
  meetings_target   integer,
  reply_rate_target numeric(5,2),
  -- Additive indexing columns (Amendment 008) — not in the original §13.2 shape.
  is_indexed        boolean not null default false,
  last_indexed_at   timestamptz,
  content_hash      text not null default '',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint ck_workspace_targets_amount check (revenue_target >= 0),
  constraint ck_workspace_targets_currency check (currency ~ '^[A-Z]{3}$'),
  constraint ck_workspace_targets_range check (period_end > period_start),
  constraint ck_workspace_targets_meetings check (meetings_target is null or meetings_target >= 0),
  constraint ck_workspace_targets_reply check (reply_rate_target is null or reply_rate_target >= 0)
);

-- One target per (workspace, period, period_start) — the frozen "one active per
-- period" semantics (docs/04 §13.2; Sprint 4.7 D5, no status column).
create unique index if not exists uq_workspace_targets_ws_period_range
  on public.workspace_targets (workspace_id, period, period_start)
  where deleted_at is null;
create index if not exists idx_workspace_targets_ws_period
  on public.workspace_targets (workspace_id, period) where deleted_at is null;

alter table public.workspace_targets enable row level security;
alter table public.workspace_targets force row level security;
drop policy if exists workspace_targets_tenant_select on public.workspace_targets;
create policy workspace_targets_tenant_select on public.workspace_targets for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists workspace_targets_tenant_insert on public.workspace_targets;
create policy workspace_targets_tenant_insert on public.workspace_targets for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
drop policy if exists workspace_targets_tenant_update on public.workspace_targets;
create policy workspace_targets_tenant_update on public.workspace_targets for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Create + emit target.set atomically (docs/05 §3.6). Business event, journaled.
create or replace function public.set_target_with_event(p_target jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.workspace_targets;
begin
  insert into public.workspace_targets (
    id, workspace_id, period, period_start, period_end, revenue_target, currency,
    meetings_target, reply_rate_target, content_hash, created_by
  ) select id, workspace_id, period, period_start, period_end, revenue_target, currency,
    meetings_target, reply_rate_target, content_hash, created_by
    from jsonb_populate_record(null::public.workspace_targets, p_target) returning * into v;
  perform public._persist_domain_event(p_event, v.workspace_id, v.id, array['target.set']);
  return to_jsonb(v);
end $$;

-- Update + re-emit target.set (content edit → re-index via is_indexed reset by caller).
create or replace function public.update_target_with_event(
  p_id uuid, p_workspace uuid, p_target jsonb, p_event jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.workspace_targets;
begin
  update public.workspace_targets c set
    period=s.period, period_start=s.period_start, period_end=s.period_end,
    revenue_target=s.revenue_target, currency=s.currency, meetings_target=s.meetings_target,
    reply_rate_target=s.reply_rate_target, content_hash=s.content_hash,
    is_indexed=s.is_indexed, updated_at=now()
  from jsonb_populate_record(null::public.workspace_targets, p_target) s
  where c.id=p_id and c.workspace_id=p_workspace and c.deleted_at is null
  returning c.* into v;
  if not found then return null; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['target.set']);
  return to_jsonb(v);
end $$;

-- Mark indexed + emit target.indexed (Amendment 008). Called by the service-role indexer.
create or replace function public.set_target_indexed_with_event(
  p_id uuid, p_workspace uuid, p_event jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.workspace_targets set is_indexed=true, last_indexed_at=now()
    where id=p_id and workspace_id=p_workspace and deleted_at is null;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['target.indexed']);
  return true;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('set_target_with_event','update_target_with_event','set_target_indexed_with_event')
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
