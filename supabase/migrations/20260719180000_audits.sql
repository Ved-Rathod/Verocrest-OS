-- Sprint 4.8: Website Intelligence (docs/04 §6.1–6.2). Implements the FROZEN
-- `audits` + `audit_findings` tables (reused, NOT duplicated — D2), plus additive
-- AI-indexing columns (`signals`, `content_hash`, `is_indexed`, `last_indexed_at`
-- — Amendment 009). v0.1 is a DETERMINISTIC analyzer (no Browserless/AI/Loom — D1),
-- run synchronously; Browserless + the `audit-website` AI capability + screenshots
-- + Loom remain the full Sprint 8. Forward-only.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'audit_status_enum') then
    create type public.audit_status_enum as enum ('pending', 'running', 'completed', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'finding_category_enum') then
    create type public.finding_category_enum as enum (
      'cta', 'booking', 'mobile', 'trust', 'conversion',
      'performance', 'seo', 'forms', 'brand', 'accessibility'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'finding_severity_enum') then
    create type public.finding_severity_enum as enum ('low', 'medium', 'high', 'critical');
  end if;
end $$;

create table if not exists public.audits (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  url_original           text not null,
  url_normalized         text not null,
  requested_by_user_id   uuid references auth.users(id),
  requested_by_agent     text,
  company_id             uuid references public.companies(id) on delete set null,
  contact_id             uuid references public.contacts(id) on delete set null,
  lead_id                uuid references public.leads(id) on delete set null,
  deal_id                uuid, -- FK added when deals land (docs/04 §6.1 note)
  status                 public.audit_status_enum not null default 'pending',
  overall_grade          smallint check (overall_grade between 0 and 100),
  category_grades        jsonb,
  findings_count         integer,
  browserless_session_id text,
  screenshot_url         text,
  full_render_url        text,
  model                  text,
  cost_usd               numeric(10,4),
  latency_ms             integer,
  started_at             timestamptz,
  completed_at           timestamptz,
  error                  jsonb,
  audit_config           jsonb not null default '{}'::jsonb,
  -- Additive (Amendment 009): normalized deterministic signals + AI-index tracking.
  signals                jsonb not null default '{}'::jsonb,
  content_hash           text not null default '',
  is_indexed             boolean not null default false,
  last_indexed_at        timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists idx_audits_ws_status on public.audits (workspace_id, status);
create index if not exists idx_audits_ws_url on public.audits (workspace_id, url_normalized);
create index if not exists idx_audits_ws_company on public.audits (workspace_id, company_id) where company_id is not null;
create index if not exists idx_audits_ws_contact on public.audits (workspace_id, contact_id) where contact_id is not null;
create index if not exists idx_audits_ws_completed_at on public.audits (workspace_id, completed_at desc) where completed_at is not null;

create table if not exists public.audit_findings (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  audit_id       uuid not null references public.audits(id) on delete cascade,
  category       public.finding_category_enum not null,
  severity       public.finding_severity_enum not null,
  title          text not null,
  description    text not null,
  recommendation text not null,
  evidence       jsonb not null default '{}'::jsonb,
  confidence     smallint check (confidence between 0 and 100),
  position       integer not null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_audit_findings_audit on public.audit_findings (audit_id, position);

-- RLS — workspace isolation (docs/03 §12). The deterministic analyzer runs in a
-- member Server Action, so members insert; append-only (no update/delete policy).
alter table public.audits enable row level security;
alter table public.audits force row level security;
drop policy if exists audits_tenant_select on public.audits;
create policy audits_tenant_select on public.audits for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists audits_tenant_insert on public.audits;
create policy audits_tenant_insert on public.audits for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

alter table public.audit_findings enable row level security;
alter table public.audit_findings force row level security;
drop policy if exists audit_findings_tenant_select on public.audit_findings;
create policy audit_findings_tenant_select on public.audit_findings for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists audit_findings_tenant_insert on public.audit_findings;
create policy audit_findings_tenant_insert on public.audit_findings for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

-- Record a completed analysis (audit + findings) + emit website.audit.completed,
-- all in one transaction (docs/03 §8.4 atomic *_with_event pattern).
create or replace function public.record_audit_with_event(p_audit jsonb, p_findings jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.audits;
begin
  insert into public.audits (
    id, workspace_id, url_original, url_normalized, requested_by_user_id, company_id,
    contact_id, lead_id, status, overall_grade, category_grades, findings_count,
    latency_ms, started_at, completed_at, audit_config, signals, content_hash
  ) select id, workspace_id, url_original, url_normalized, requested_by_user_id, company_id,
    contact_id, lead_id, status, overall_grade, category_grades, findings_count,
    latency_ms, started_at, completed_at, audit_config, signals, content_hash
    from jsonb_populate_record(null::public.audits, p_audit) returning * into v;

  insert into public.audit_findings (
    workspace_id, audit_id, category, severity, title, description, recommendation,
    evidence, confidence, position
  )
  select v.workspace_id, v.id, f.category, f.severity, f.title, f.description,
    f.recommendation, coalesce(f.evidence, '{}'::jsonb), f.confidence, f.position
  from jsonb_to_recordset(coalesce(p_findings, '[]'::jsonb)) as f(
    category public.finding_category_enum, severity public.finding_severity_enum,
    title text, description text, recommendation text, evidence jsonb,
    confidence smallint, position integer
  );

  perform public._persist_domain_event(p_event, v.workspace_id, v.id, array['website.audit.completed']);
  return to_jsonb(v);
end $$;

-- Mark an audit indexed + emit website.audit.indexed (Amendment 009).
create or replace function public.set_audit_indexed_with_event(
  p_id uuid, p_workspace uuid, p_event jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.audits set is_indexed = true, last_indexed_at = now()
    where id = p_id and workspace_id = p_workspace;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['website.audit.indexed']);
  return true;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('record_audit_with_event','set_audit_indexed_with_event')
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
