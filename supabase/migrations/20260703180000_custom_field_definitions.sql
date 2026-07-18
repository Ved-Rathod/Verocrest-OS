-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2.6 — Custom field definitions (domain-contacts, docs/04 §20.1)
-- Schema per docs/04_Database_Design.md §20.1 (frozen, verbatim). Forward-only.
--
-- Declares typed custom fields per entity_type; VALUES live in the existing
-- `custom_fields` jsonb columns on contacts/companies (docs/04 §1.5 — JSONB, not
-- EAV; custom fields are display/entry only, never filtered/sorted). v0.1 has NO
-- editor UI (FR-CNT-006 is P1): definitions are seeded manually via SQL. The app
-- only READS active definitions to render + validate.
--
-- Tenancy: membership-based RLS on `authenticated` via is_workspace_member(),
-- identical to companies/contacts/leads/reminders (docs/03 §4).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists citext;

-- ── Enums (docs/04 §20.1 + §22) ──────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'custom_field_entity_enum') then
    create type public.custom_field_entity_enum as enum ('contact', 'lead', 'deal', 'company');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'custom_field_type_enum') then
    create type public.custom_field_type_enum as enum (
      'text', 'long_text', 'number', 'currency', 'date', 'datetime',
      'boolean', 'url', 'email', 'single_select', 'multi_select'
    );
  end if;
end
$$;

-- ── custom_field_definitions (docs/04 §20.1, verbatim) ───────────────────────
create table if not exists public.custom_field_definitions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  entity_type   public.custom_field_entity_enum not null,
  field_key     citext not null,
  field_label   text not null,
  field_type    public.custom_field_type_enum not null,
  options       jsonb,
  required      boolean not null default false,
  active        boolean not null default true,
  display_order integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index if not exists uq_custom_field_definitions_ws_entity_key
  on public.custom_field_definitions (workspace_id, entity_type, field_key)
  where deleted_at is null;

-- Render hot path: active definitions for an entity, in display order.
create index if not exists idx_custom_field_definitions_ws_entity
  on public.custom_field_definitions (workspace_id, entity_type, display_order)
  where active and deleted_at is null;

drop trigger if exists trg_custom_field_definitions_updated_at on public.custom_field_definitions;
create trigger trg_custom_field_definitions_updated_at
  before update on public.custom_field_definitions
  for each row execute function public.set_updated_at();

-- ── Row Level Security (membership-based; docs/03 §4) ────────────────────────
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_definitions force row level security;

drop policy if exists custom_field_definitions_tenant_select on public.custom_field_definitions;
create policy custom_field_definitions_tenant_select on public.custom_field_definitions
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- INSERT/UPDATE policies for the future definition editor (P1). No app path
-- writes definitions in v0.1 (manual SQL seeding, run as superuser). No DELETE
-- policy (soft-delete convention, docs/04 §1.8).
drop policy if exists custom_field_definitions_tenant_insert on public.custom_field_definitions;
create policy custom_field_definitions_tenant_insert on public.custom_field_definitions
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists custom_field_definitions_tenant_update on public.custom_field_definitions;
create policy custom_field_definitions_tenant_update on public.custom_field_definitions
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
