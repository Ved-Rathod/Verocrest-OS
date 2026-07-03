-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 1.4 — Workspaces & multi-tenancy foundation
-- Schema per docs/04_Database_Design.md §3.1–3.3 (frozen). Forward-only.
--
-- Tenancy note (docs/04 §21, docs/03 §4): `workspaces` and `workspace_members`
-- are the ROOT of tenancy, so their RLS policies are membership-based on
-- auth.uid(). The GUC-based policy pattern (app.workspace_id) applies to
-- workspace-SCOPED business tables from the CRM sprint onward.
--
-- Write posture: NO INSERT/DELETE policies exist on these tables. All
-- provisioning flows through provision_default_workspace() (SECURITY DEFINER,
-- authenticated-only). Owners may UPDATE their workspace. Everything else is
-- denied by default.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists citext;

-- Shared updated_at trigger (docs/04 §1.1)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Role enum per docs/04 §3.2. MVP uses only 'owner' and 'member';
-- 'admin' and 'guest' are reserved for Phase 3.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_role_enum') then
    create type public.workspace_role_enum as enum ('owner', 'admin', 'member', 'guest');
  end if;
end
$$;

-- ── workspaces (docs/04 §3.1) ────────────────────────────────────────────────
create table if not exists public.workspaces (
  id                     uuid primary key default gen_random_uuid(),
  slug                   citext not null,
  name                   text not null,
  timezone               text not null default 'UTC',
  default_currency       char(3) not null default 'USD',
  locale                 text not null default 'en',
  brand                  jsonb not null default '{}'::jsonb,
  plan                   text not null default 'internal',
  ai_budget_monthly_usd  numeric(12,2) not null default 200,
  settings               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  constraint ck_workspaces_currency check (default_currency ~ '^[A-Z]{3}$'),
  constraint ck_workspaces_name_length check (char_length(name) between 2 and 60)
);

create unique index if not exists uq_workspaces_slug_active
  on public.workspaces (slug) where deleted_at is null;

create index if not exists idx_workspaces_deleted_at
  on public.workspaces (deleted_at);

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ── workspace_members (docs/04 §3.2) ─────────────────────────────────────────
create table if not exists public.workspace_members (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            public.workspace_role_enum not null,
  timezone        text,
  invited_by      uuid references auth.users(id),
  joined_at       timestamptz not null default now(),
  last_active_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create unique index if not exists uq_workspace_members_ws_user_active
  on public.workspace_members (workspace_id, user_id) where deleted_at is null;

create index if not exists idx_workspace_members_user
  on public.workspace_members (user_id) where deleted_at is null;

drop trigger if exists trg_workspace_members_updated_at on public.workspace_members;
create trigger trg_workspace_members_updated_at
  before update on public.workspace_members
  for each row execute function public.set_updated_at();

-- ── workspace_invites (docs/04 §3.3 — structural; Phase 3 surface) ───────────
create table if not exists public.workspace_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         citext not null,
  role          public.workspace_role_enum not null default 'member',
  token_hash    text not null,
  invited_by    uuid not null references auth.users(id),
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists uq_workspace_invites_token
  on public.workspace_invites (token_hash);

create index if not exists idx_workspace_invites_ws_email
  on public.workspace_invites (workspace_id, email);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;
alter table public.workspace_invites enable row level security;
alter table public.workspace_invites force row level security;
-- workspace_invites: RLS enabled with NO policies = deny-all (structural table).

-- Members can see the workspaces they belong to.
drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspaces.id
        and m.user_id = auth.uid()
        and m.deleted_at is null
    )
  );

-- Only owners can update workspace settings (FR-WS role scoping).
drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner on public.workspaces
  for update to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspaces.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and m.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspaces.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and m.deleted_at is null
    )
  );

-- Users can see their own membership rows.
drop policy if exists workspace_members_select_own on public.workspace_members;
create policy workspace_members_select_own on public.workspace_members
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

-- ── Provisioning (SECURITY DEFINER — the only write path for creation) ──────
-- Idempotent: if the caller already has a workspace, returns the earliest one.
-- Atomic: workspace + owner membership in one transaction.
create or replace function public.provision_default_workspace(
  p_name text,
  p_slug citext,
  p_timezone text default 'UTC',
  p_currency char(3) default 'USD'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_existing record;
  v_workspace public.workspaces%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Idempotency: earliest live membership wins.
  select w.*, m.role as member_role
    into v_existing
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.user_id = v_user_id
     and m.deleted_at is null
     and w.deleted_at is null
   order by m.joined_at asc
   limit 1;

  if found then
    return to_jsonb(v_existing) - 'member_role'
      || jsonb_build_object('role', v_existing.member_role);
  end if;

  -- Input validation (definer functions must not trust callers).
  if p_name is null or char_length(btrim(p_name)) not between 2 and 60 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;
  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  insert into public.workspaces (slug, name, timezone, default_currency)
  values (p_slug, btrim(p_name), coalesce(nullif(btrim(p_timezone), ''), 'UTC'), p_currency)
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace.id, v_user_id, 'owner');

  return to_jsonb(v_workspace) || jsonb_build_object('role', 'owner');
end;
$$;

revoke all on function public.provision_default_workspace(text, citext, text, char) from public;
grant execute on function public.provision_default_workspace(text, citext, text, char) to authenticated;
