-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2.1 — Companies (Module 2 / domain-contacts, docs/06 §3.8)
-- Schema per docs/04_Database_Design.md §4.5 (frozen). Forward-only.
--
-- Tenancy (docs/03 §4, NFR-SEC-003): membership-based RLS on the `authenticated`
-- role via is_workspace_member(). This is the current-stack implementation of the
-- frozen §21 invariant; it migrates to the GUC + app_role_* form when platform-db
-- lands. The guarantee is identical: no user can read/write a company outside a
-- workspace they belong to.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists citext;
create extension if not exists pg_trgm;   -- gin_trgm_ops for name search (docs/04 §4.5)
create extension if not exists btree_gin;  -- allows uuid/text[] alongside trgm in GIN indexes

-- ── Tenancy helper: is the current user a member of this workspace? ──────────
-- SECURITY DEFINER + explicit search_path: only ever checks auth.uid()'s OWN
-- membership, so it cannot leak. Reused by every workspace-scoped table's RLS.
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.deleted_at is null
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- ── company_size_enum (docs/04 §4.5) ────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_size_enum') then
    create type public.company_size_enum as enum
      ('solo', 'micro', 'small', 'medium', 'large', 'enterprise');
  end if;
end
$$;

-- ── companies (docs/04 §4.5, verbatim) ──────────────────────────────────────
create table if not exists public.companies (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  name                  text not null,
  legal_name            text,
  domain                citext,
  domain_normalized     citext generated always as
                          (lower(regexp_replace(coalesce(domain, ''), '^www\.', ''))) stored,
  website_url           text,
  industry              text,
  sub_industry          text,
  size                  public.company_size_enum,
  employee_count        integer,
  annual_revenue        numeric(18,4),
  revenue_currency      char(3),
  location              jsonb,
  linkedin_url          text,
  description           text,
  tags                  text[] not null default '{}',
  custom_fields         jsonb not null default '{}'::jsonb,
  is_client             boolean not null default false,
  primary_owner_user_id uuid references auth.users(id),
  source                text,
  source_batch_id       uuid,
  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint ck_companies_currency
    check (revenue_currency is null or revenue_currency ~ '^[A-Z]{3}$'),
  constraint ck_companies_name_length check (char_length(name) between 1 and 200),
  constraint ck_companies_employee_count check (employee_count is null or employee_count >= 0)
);

-- Indexes per docs/04 §4.5
create unique index if not exists uq_companies_ws_domain_active
  on public.companies (workspace_id, domain_normalized)
  where domain_normalized <> '' and deleted_at is null;

create index if not exists idx_companies_ws_name_trgm
  on public.companies using gin (workspace_id, name gin_trgm_ops);

create index if not exists idx_companies_ws_industry
  on public.companies (workspace_id, industry) where deleted_at is null;

create index if not exists idx_companies_ws_size
  on public.companies (workspace_id, size) where deleted_at is null;

create index if not exists idx_companies_ws_tags
  on public.companies using gin (workspace_id, tags);

create index if not exists idx_companies_ws_is_client
  on public.companies (workspace_id, is_client) where deleted_at is null;

-- Keyset pagination hot path (docs/10 §12.3): (workspace_id, created_at desc, id desc)
create index if not exists idx_companies_ws_created_id
  on public.companies (workspace_id, created_at desc, id desc) where deleted_at is null;

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ── Row Level Security (membership-based; docs/03 §4) ────────────────────────
alter table public.companies enable row level security;
alter table public.companies force row level security;

-- Soft-delete filtering is a repository-layer concern (docs/04 §1.8); RLS
-- enforces TENANCY only. No DELETE policy: hard delete is not exposed to
-- authenticated (soft-delete is the only path).

drop policy if exists companies_tenant_select on public.companies;
create policy companies_tenant_select on public.companies
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists companies_tenant_insert on public.companies;
create policy companies_tenant_insert on public.companies
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists companies_tenant_update on public.companies;
create policy companies_tenant_update on public.companies
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
