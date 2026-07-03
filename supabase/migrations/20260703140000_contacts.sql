-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2.2 — Contacts (Module 2 / domain-contacts)
-- Schema per docs/04_Database_Design.md §4.1 + §4.5 company FK. Forward-only.
--
-- Depends on: 20260703130000_companies.sql (companies table + is_workspace_member).
-- Tenancy: membership-based RLS on `authenticated` via is_workspace_member(),
-- identical to companies (docs/03 §4). Migrates to the GUC + app_role_* form
-- when platform-db lands.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists btree_gin;

-- ── contacts (docs/04 §4.1; company_id FK per §4.5) ─────────────────────────
create table if not exists public.contacts (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  company_id               uuid references public.companies(id) on delete set null,
  first_name               text,
  last_name                text,
  primary_email            citext,
  primary_email_normalized citext generated always as (lower(trim(primary_email))) stored,
  phones                   jsonb not null default '[]'::jsonb,
  company_name             text,       -- display cache (docs/04 §4.1)
  role_title               text,
  seniority                text,       -- ic|manager|director|vp|c_suite|owner (app-validated)
  is_decision_maker        boolean not null default false,
  website_url              text,
  linkedin_url             text,
  location                 jsonb,
  source                   text,
  source_batch_id          uuid,
  tags                     text[] not null default '{}',
  custom_fields            jsonb not null default '{}'::jsonb,
  notes                    text,
  is_client                boolean not null default false,
  created_by               uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  constraint ck_contacts_names_length
    check (char_length(coalesce(first_name, '')) <= 120
       and char_length(coalesce(last_name, '')) <= 120)
);

-- Indexes per docs/04 §4.1
create unique index if not exists uq_contacts_ws_email_active
  on public.contacts (workspace_id, primary_email_normalized)
  where primary_email_normalized is not null and deleted_at is null;

create index if not exists idx_contacts_ws_name_trgm
  on public.contacts using gin (workspace_id, (first_name || ' ' || last_name) gin_trgm_ops);

create index if not exists idx_contacts_ws_company_name_trgm
  on public.contacts using gin (workspace_id, company_name gin_trgm_ops);

create index if not exists idx_contacts_ws_tags
  on public.contacts using gin (workspace_id, tags);

create index if not exists idx_contacts_ws_source
  on public.contacts (workspace_id, source) where deleted_at is null;

-- Company link (docs/04 §4.5)
create index if not exists idx_contacts_ws_company
  on public.contacts (workspace_id, company_id) where company_id is not null and deleted_at is null;

-- Keyset pagination hot path (docs/10 §12.3)
create index if not exists idx_contacts_ws_created_id
  on public.contacts (workspace_id, created_at desc, id desc) where deleted_at is null;

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ── Row Level Security (membership-based; docs/03 §4) ────────────────────────
alter table public.contacts enable row level security;
alter table public.contacts force row level security;

drop policy if exists contacts_tenant_select on public.contacts;
create policy contacts_tenant_select on public.contacts
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists contacts_tenant_insert on public.contacts;
create policy contacts_tenant_insert on public.contacts
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists contacts_tenant_update on public.contacts;
create policy contacts_tenant_update on public.contacts
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
