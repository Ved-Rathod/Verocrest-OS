-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2.4 — Reminders (Module 5 surface / domain-reminders)
-- Schema per docs/04_Database_Design.md §12 (frozen, verbatim). Forward-only.
--
-- Depends on: 20260703120000_workspaces_foundation.sql (workspaces, is_workspace_member,
-- set_updated_at). Reminders are POLYMORPHIC (entity_type + entity_id) — no FK to the
-- referenced entity is possible; existence is validated at the application layer.
-- Tenancy: membership-based RLS on `authenticated` via is_workspace_member(),
-- identical to companies/contacts/leads (docs/03 §4).
--
-- v0.1 scope (FR-REM-001/002/003): manual reminders CRUD + complete/snooze. The
-- 'automation'/'agent' source paths (FR-REM-004), reminder.* events, and the
-- due-sweep scheduler are Event-Bus/Sprint-5 concerns and are NOT wired here.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums (docs/04 §12 + §22) ────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reminder_entity_enum') then
    create type public.reminder_entity_enum as enum ('contact', 'lead', 'deal', 'company');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'reminder_status_enum') then
    create type public.reminder_status_enum as enum ('pending', 'completed', 'snoozed', 'dismissed');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'reminder_source_enum') then
    create type public.reminder_source_enum as enum ('manual', 'automation', 'agent');
  end if;
end
$$;

-- ── reminders (docs/04 §12, verbatim) ────────────────────────────────────────
create table if not exists public.reminders (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id  uuid not null references auth.users(id),
  entity_type    public.reminder_entity_enum not null,
  entity_id      uuid not null,
  note           text,
  due_at         timestamptz not null,
  snoozed_until  timestamptz,
  status         public.reminder_status_enum not null default 'pending',
  source         public.reminder_source_enum not null default 'manual',
  automation_id  uuid,
  agent_id       text,
  completed_at   timestamptz,
  completed_by   uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- Indexes (docs/04 §12, verbatim) ─────────────────────────────────────────────
create index if not exists idx_reminders_ws_owner_due
  on public.reminders (workspace_id, owner_user_id, due_at)
  where status = 'pending' and deleted_at is null;

create index if not exists idx_reminders_ws_entity
  on public.reminders (workspace_id, entity_type, entity_id);

drop trigger if exists trg_reminders_updated_at on public.reminders;
create trigger trg_reminders_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- ── Row Level Security (membership-based; docs/03 §4) ────────────────────────
alter table public.reminders enable row level security;
alter table public.reminders force row level security;

drop policy if exists reminders_tenant_select on public.reminders;
create policy reminders_tenant_select on public.reminders
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists reminders_tenant_insert on public.reminders;
create policy reminders_tenant_insert on public.reminders
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists reminders_tenant_update on public.reminders;
create policy reminders_tenant_update on public.reminders
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
