-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2.3 — Leads (Module 2 / domain-leads)
-- Schema per docs/04_Database_Design.md §5.1 AS AMENDED by Amendment 001
-- (docs/BLUEPRINT_AMENDMENTS.md). Forward-only.
--
-- Depends on: 20260703130000_companies.sql, 20260703140000_contacts.sql.
-- Tenancy: membership-based RLS on `authenticated` via is_workspace_member(),
-- identical to companies/contacts (docs/03 §4).
--
-- Amendment 001: priority / estimated_value / currency / expected_close_date /
-- notes / tags are proper columns; contact_id remains REQUIRED (one active lead
-- per contact); company derives from the contact.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists btree_gin;

-- ── Enums (docs/04 §5.1 + §22) ───────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status_enum') then
    create type public.lead_status_enum as enum (
      'new', 'enriching', 'scored', 'ready',
      'contacted', 'engaged', 'nurturing',
      'meeting_booked', 'meeting_held',
      'proposal_sent', 'won', 'lost',
      'disqualified', 'unsubscribed'
    );
  end if;
end
$$;

-- Amendment 001: manual lead priority, distinct from the AI opportunity score.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_priority_enum') then
    create type public.lead_priority_enum as enum ('low', 'medium', 'high');
  end if;
end
$$;

-- ── leads (amended docs/04 §5.1, verbatim) ───────────────────────────────────
create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  contact_id          uuid not null references public.contacts(id) on delete cascade,
  company_id          uuid references public.companies(id) on delete set null,  -- denormalized from contact
  status              public.lead_status_enum not null default 'new',
  owner_user_id       uuid references auth.users(id),
  source              text,
  -- Amendment 001 columns
  priority            public.lead_priority_enum,
  estimated_value     numeric(18,4),
  currency            char(3),
  expected_close_date date,
  notes               text,
  tags                text[] not null default '{}',
  -- frozen columns (cont.)
  ingestion_batch_id  uuid,
  first_ingested_at   timestamptz not null default now(),
  qualified_at        timestamptz,
  disqualified_at     timestamptz,
  disqualified_reason text,
  custom_fields       jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint ck_leads_currency check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint ck_leads_estimated_value check (estimated_value is null or estimated_value >= 0)
);

-- One active lead per contact (docs/04 §5.1, affirmed by Amendment 001)
create unique index if not exists uq_leads_ws_contact_active
  on public.leads (workspace_id, contact_id) where deleted_at is null;

create index if not exists idx_leads_ws_status
  on public.leads (workspace_id, status) where deleted_at is null;

create index if not exists idx_leads_ws_owner
  on public.leads (workspace_id, owner_user_id) where deleted_at is null;

create index if not exists idx_leads_ws_company
  on public.leads (workspace_id, company_id) where company_id is not null;

-- Amendment 001: filter hot paths
create index if not exists idx_leads_ws_priority
  on public.leads (workspace_id, priority) where deleted_at is null;

create index if not exists idx_leads_ws_tags
  on public.leads using gin (workspace_id, tags);

-- Keyset pagination hot path (docs/10 §12.3, established pattern)
create index if not exists idx_leads_ws_created_id
  on public.leads (workspace_id, created_at desc, id desc) where deleted_at is null;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ── Row Level Security (membership-based; docs/03 §4) ────────────────────────
alter table public.leads enable row level security;
alter table public.leads force row level security;

drop policy if exists leads_tenant_select on public.leads;
create policy leads_tenant_select on public.leads
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists leads_tenant_insert on public.leads;
create policy leads_tenant_insert on public.leads
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists leads_tenant_update on public.leads;
create policy leads_tenant_update on public.leads
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
