-- Sprint 3.3: AI substrate persistence — ai_usage_events, ai_usage_daily,
-- prompt_library (docs/04 §18) and the atomic usage+event RPC (Amendment 005).
-- Forward-only. No triggers, no ORM. Memory/pgvector land in Sprint 3.4.

-- 18.1 ai_usage_events (append-only)
create table if not exists public.ai_usage_events (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  request_id     text not null,
  capability     text not null,
  provider       text not null,
  model          text not null,
  input_tokens   integer not null,
  output_tokens  integer not null,
  cost_usd       numeric(12,6) not null,
  latency_ms     integer not null,
  caller_module  text not null,
  agent_id       text,
  prompt_id      text,
  prompt_version integer,
  prompt_library_id uuid,
  status         text not null,
  error          jsonb,
  occurred_at    timestamptz not null default now()
);

create index if not exists idx_ai_usage_events_ws_time
  on public.ai_usage_events (workspace_id, occurred_at desc);
create index if not exists idx_ai_usage_events_ws_capability
  on public.ai_usage_events (workspace_id, capability, occurred_at desc);
create index if not exists idx_ai_usage_events_ws_agent
  on public.ai_usage_events (workspace_id, agent_id) where agent_id is not null;
create index if not exists idx_ai_usage_events_ws_prompt
  on public.ai_usage_events (workspace_id, prompt_library_id) where prompt_library_id is not null;

alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_events force row level security;
drop policy if exists ai_usage_events_tenant_select on public.ai_usage_events;
create policy ai_usage_events_tenant_select on public.ai_usage_events for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists ai_usage_events_tenant_insert on public.ai_usage_events;
create policy ai_usage_events_tenant_insert on public.ai_usage_events for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
-- Append-only: no UPDATE/DELETE policies.

-- 18.2 ai_usage_daily (rollup; written by the cost-aggregator subscriber via service role)
create table if not exists public.ai_usage_daily (
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  day                date not null,
  total_calls        integer not null default 0,
  total_cost_usd     numeric(12,4) not null default 0,
  total_input_tokens bigint not null default 0,
  total_output_tokens bigint not null default 0,
  by_capability      jsonb not null default '{}'::jsonb,
  by_model           jsonb not null default '{}'::jsonb,
  by_agent           jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now(),
  primary key (workspace_id, day)
);

alter table public.ai_usage_daily enable row level security;
alter table public.ai_usage_daily force row level security;
drop policy if exists ai_usage_daily_tenant_select on public.ai_usage_daily;
create policy ai_usage_daily_tenant_select on public.ai_usage_daily for select to authenticated
  using (public.is_workspace_member(workspace_id));
-- Writes come only from the service-role aggregator (bypasses RLS); no member write policies.

-- 18.3 prompt_library (global rows have workspace_id null; v0.1 UI is read-only viewer)
create table if not exists public.prompt_library (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid references public.workspaces(id) on delete cascade,
  key                  citext not null,
  version              integer not null,
  capability           text not null,
  template             text not null,
  system_message       text,
  variables            jsonb not null default '[]'::jsonb,
  expected_schema      jsonb,
  examples             jsonb not null default '[]'::jsonb,
  model_hint           text,
  provider_hint        text,
  temperature          numeric(3,2),
  max_output_tokens    integer,
  reasoning_effort     text,
  notes                text,
  changelog            text,
  active               boolean not null default false,
  is_default           boolean not null default false,
  overrides_prompt_library_id uuid references public.prompt_library(id),
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create unique index if not exists uq_prompt_library_scope_key_version
  on public.prompt_library (coalesce(workspace_id::text, 'global'), key, version)
  where deleted_at is null;
create unique index if not exists uq_prompt_library_scope_key_active_default
  on public.prompt_library (coalesce(workspace_id::text, 'global'), key)
  where active = true and is_default = true and deleted_at is null;
create index if not exists idx_prompt_library_capability
  on public.prompt_library (capability, active) where deleted_at is null;
create index if not exists idx_prompt_library_key
  on public.prompt_library (key) where active = true and deleted_at is null;

alter table public.prompt_library enable row level security;
alter table public.prompt_library force row level security;
drop policy if exists prompt_library_tenant_select on public.prompt_library;
create policy prompt_library_tenant_select on public.prompt_library for select to authenticated
  using (workspace_id is null or public.is_workspace_member(workspace_id));
-- v0.1: no member write policies (docs/09 §3.9 — viewer only; seeds applied by product).

-- Atomic usage log + event journal write (same transactional pattern as the CRM
-- *_with_event RPCs; docs/10 §11.3, Amendment 005). The app builds both rows;
-- this function persists them in one transaction. Returns the usage row id.
create or replace function public.log_ai_usage_with_event(p_usage jsonb, p_event jsonb)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.ai_usage_events;
begin
  insert into public.ai_usage_events (
    id, workspace_id, request_id, capability, provider, model, input_tokens,
    output_tokens, cost_usd, latency_ms, caller_module, agent_id, prompt_id,
    prompt_version, prompt_library_id, status, error, occurred_at
  ) select id, workspace_id, request_id, capability, provider, model, input_tokens,
    output_tokens, cost_usd, latency_ms, caller_module, agent_id, prompt_id,
    prompt_version, prompt_library_id, status, error, occurred_at
    from jsonb_populate_record(null::public.ai_usage_events, p_usage)
    returning * into v;
  perform public._persist_domain_event(p_event, v.workspace_id, v.id, array['ai.output.produced']);
  return v.id;
end $$;

revoke all on function public.log_ai_usage_with_event(jsonb, jsonb) from public;
grant execute on function public.log_ai_usage_with_event(jsonb, jsonb) to authenticated;

-- Live month-to-date spend for the budget gate (docs/09 §6.2 — ai_usage_events is
-- the source of truth; summed in SQL, not paged to the app). SECURITY INVOKER:
-- RLS restricts the sum to workspaces the caller is a member of.
create or replace function public.month_ai_spend_usd(p_workspace uuid)
returns numeric language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(sum(cost_usd), 0)
  from public.ai_usage_events
  where workspace_id = p_workspace
    and occurred_at >= date_trunc('month', now());
$$;

revoke all on function public.month_ai_spend_usd(uuid) from public;
grant execute on function public.month_ai_spend_usd(uuid) to authenticated;
