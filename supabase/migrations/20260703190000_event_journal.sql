-- Sprint 3.1: durable Agency Event Bus journal and atomic CRM mutation RPCs.
-- Amendment 004. Forward-only. No triggers, workers, dispatcher, or ORM.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'actor_type_enum') then
    create type public.actor_type_enum as enum ('user', 'agent', 'system', 'integration');
  end if;
end $$;

create table if not exists public.event_journal (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  version integer not null check (version > 0),
  actor_type public.actor_type_enum not null,
  actor_id text not null,
  subject_type text not null,
  subject_id uuid,
  payload jsonb not null,
  correlation_id text,
  causation_id text,
  occurred_at timestamptz not null,
  emitted_at timestamptz not null default now()
);

create index if not exists idx_event_journal_ws_name_time
  on public.event_journal (workspace_id, name, occurred_at desc);
create index if not exists idx_event_journal_ws_subject
  on public.event_journal (workspace_id, subject_type, subject_id);
create index if not exists idx_event_journal_correlation
  on public.event_journal (correlation_id) where correlation_id is not null;
create index if not exists idx_event_journal_ws_time_pruning
  on public.event_journal (workspace_id, emitted_at);

alter table public.event_journal enable row level security;
alter table public.event_journal force row level security;
drop policy if exists event_journal_tenant_select on public.event_journal;
create policy event_journal_tenant_select on public.event_journal for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists event_journal_tenant_insert on public.event_journal;
create policy event_journal_tenant_insert on public.event_journal for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

-- Shared persistence guard. The application owns event construction; this helper
-- only enforces that the journal row belongs to the mutation being committed.
create or replace function public._persist_domain_event(
  p_event jsonb, p_workspace uuid, p_subject uuid, p_allowed_names text[]
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare e public.event_journal;
begin
  select * into e from jsonb_populate_record(null::public.event_journal, p_event);
  if e.workspace_id is distinct from p_workspace
     or e.subject_id is distinct from p_subject
     or not (e.name = any(p_allowed_names)) then
    raise exception 'event_entity_mismatch' using errcode = 'check_violation';
  end if;
  if e.actor_type = 'user' and e.actor_id is distinct from auth.uid()::text then
    raise exception 'event_actor_mismatch' using errcode = 'insufficient_privilege';
  end if;
  insert into public.event_journal
  select (e).*;
end $$;

-- Companies -----------------------------------------------------------------
create or replace function public.create_company_with_event(p_company jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.companies;
begin
  insert into public.companies (
    id, workspace_id, name, domain, website_url, industry, size, employee_count,
    description, tags, is_client, custom_fields, created_by, primary_owner_user_id
  ) select id, workspace_id, name, domain, website_url, industry, size, employee_count,
    description, tags, is_client, custom_fields, created_by, primary_owner_user_id
    from jsonb_populate_record(null::public.companies, p_company)
    returning * into v;
  perform public._persist_domain_event(p_event, v.workspace_id, v.id, array['company.created']);
  return to_jsonb(v);
end $$;

create or replace function public.update_company_with_event(
  p_id uuid, p_workspace uuid, p_company jsonb, p_event jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.companies;
begin
  update public.companies c set
    name=s.name, domain=s.domain, website_url=s.website_url, industry=s.industry,
    size=s.size, employee_count=s.employee_count, description=s.description,
    tags=s.tags, is_client=s.is_client, custom_fields=s.custom_fields
  from jsonb_populate_record(null::public.companies, p_company) s
  where c.id=p_id and c.workspace_id=p_workspace and c.deleted_at is null
  returning c.* into v;
  if not found then return null; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['company.updated']);
  return to_jsonb(v);
end $$;

create or replace function public.archive_company_with_event(
  p_id uuid, p_workspace uuid, p_event jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.companies set deleted_at=(p_event->>'occurred_at')::timestamptz
    where id=p_id and workspace_id=p_workspace and deleted_at is null;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['company.archived']);
  return true;
end $$;

drop function if exists public.merge_companies(uuid, uuid);
create or replace function public.merge_companies_with_event(
  p_source uuid, p_target uuid, p_event jsonb
) returns table (moved_contacts integer, moved_leads integer)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_ws uuid; v_target_ws uuid; v_target_name text; v_contacts integer:=0; v_leads integer:=0;
begin
  if p_source is null or p_target is null or p_source=p_target then
    raise exception 'merge_same_company' using errcode='check_violation'; end if;
  select workspace_id into v_ws from public.companies where id=p_source and deleted_at is null;
  if v_ws is null then raise exception 'merge_source_not_found' using errcode='no_data_found'; end if;
  select workspace_id,name into v_target_ws,v_target_name from public.companies where id=p_target and deleted_at is null;
  if v_target_ws is null then raise exception 'merge_target_not_found' using errcode='no_data_found'; end if;
  if v_target_ws<>v_ws then raise exception 'merge_cross_workspace'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id=v_ws
      and user_id=auth.uid() and role='owner' and deleted_at is null) then
    raise exception 'merge_forbidden' using errcode='insufficient_privilege'; end if;
  update public.contacts set company_id=p_target,company_name=v_target_name
    where workspace_id=v_ws and company_id=p_source and deleted_at is null;
  get diagnostics v_contacts=row_count;
  update public.leads set company_id=p_target
    where workspace_id=v_ws and company_id=p_source and deleted_at is null;
  get diagnostics v_leads=row_count;
  update public.companies set deleted_at=(p_event->>'occurred_at')::timestamptz
    where id=p_source and workspace_id=v_ws and deleted_at is null;
  perform public._persist_domain_event(p_event,v_ws,p_source,array['company.merged']);
  moved_contacts:=v_contacts; moved_leads:=v_leads; return next;
end $$;

-- Contacts ------------------------------------------------------------------
create or replace function public.create_contact_with_event(p_contact jsonb,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.contacts;
begin
  insert into public.contacts (id,workspace_id,company_id,company_name,first_name,last_name,
    primary_email,phones,role_title,seniority,is_decision_maker,website_url,linkedin_url,
    notes,tags,is_client,custom_fields,created_by)
  select id,workspace_id,company_id,company_name,first_name,last_name,primary_email,phones,
    role_title,seniority,is_decision_maker,website_url,linkedin_url,notes,tags,is_client,
    custom_fields,created_by from jsonb_populate_record(null::public.contacts,p_contact)
  returning * into v;
  perform public._persist_domain_event(p_event,v.workspace_id,v.id,array['contact.created']);
  return to_jsonb(v);
end $$;

create or replace function public.update_contact_with_event(
  p_id uuid,p_workspace uuid,p_contact jsonb,p_event jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.contacts;
begin
  update public.contacts c set company_id=s.company_id,company_name=s.company_name,
    first_name=s.first_name,last_name=s.last_name,primary_email=s.primary_email,phones=s.phones,
    role_title=s.role_title,seniority=s.seniority,is_decision_maker=s.is_decision_maker,
    website_url=s.website_url,linkedin_url=s.linkedin_url,notes=s.notes,tags=s.tags,
    is_client=s.is_client,custom_fields=s.custom_fields
  from jsonb_populate_record(null::public.contacts,p_contact) s
  where c.id=p_id and c.workspace_id=p_workspace and c.deleted_at is null returning c.* into v;
  if not found then return null; end if;
  perform public._persist_domain_event(p_event,p_workspace,p_id,array['contact.updated']);
  return to_jsonb(v);
end $$;

create or replace function public.archive_contact_with_event(p_id uuid,p_workspace uuid,p_event jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  update public.contacts set deleted_at=(p_event->>'occurred_at')::timestamptz
    where id=p_id and workspace_id=p_workspace and deleted_at is null;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event,p_workspace,p_id,array['contact.archived']); return true;
end $$;

-- Leads ---------------------------------------------------------------------
create or replace function public.create_lead_with_event(p_lead jsonb,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.leads;
begin
  insert into public.leads (id,workspace_id,owner_user_id,contact_id,company_id,status,priority,
    source,estimated_value,currency,expected_close_date,notes,tags,disqualified_at,disqualified_reason)
  select id,workspace_id,owner_user_id,contact_id,company_id,status,priority,source,estimated_value,
    currency,expected_close_date,notes,tags,disqualified_at,disqualified_reason
    from jsonb_populate_record(null::public.leads,p_lead) returning * into v;
  perform public._persist_domain_event(p_event,v.workspace_id,v.id,array['lead.ingested']); return to_jsonb(v);
end $$;

create or replace function public.update_lead_with_event(
  p_id uuid,p_workspace uuid,p_expected_status public.lead_status_enum,p_lead jsonb,p_event jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.leads;
begin
  update public.leads l set contact_id=s.contact_id,company_id=s.company_id,status=s.status,
    priority=s.priority,source=s.source,estimated_value=s.estimated_value,currency=s.currency,
    expected_close_date=s.expected_close_date,notes=s.notes,tags=s.tags,
    disqualified_at=s.disqualified_at,disqualified_reason=s.disqualified_reason
  from jsonb_populate_record(null::public.leads,p_lead) s
  where l.id=p_id and l.workspace_id=p_workspace and l.deleted_at is null
    and l.status=p_expected_status returning l.* into v;
  if not found then
    if exists(select 1 from public.leads where id=p_id and workspace_id=p_workspace and deleted_at is null)
      then raise exception 'lead_status_conflict' using errcode='serialization_failure'; end if;
    return null;
  end if;
  perform public._persist_domain_event(p_event,p_workspace,p_id,array['lead.updated','lead.status_changed']);
  return to_jsonb(v);
end $$;

create or replace function public.archive_lead_with_event(p_id uuid,p_workspace uuid,p_event jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  update public.leads set deleted_at=(p_event->>'occurred_at')::timestamptz
    where id=p_id and workspace_id=p_workspace and deleted_at is null;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event,p_workspace,p_id,array['lead.archived']); return true;
end $$;

-- Reminders -----------------------------------------------------------------
create or replace function public.create_reminder_with_event(p_reminder jsonb,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.reminders;
begin
  insert into public.reminders (id,workspace_id,owner_user_id,entity_type,entity_id,note,due_at,status,source)
  select id,workspace_id,owner_user_id,entity_type,entity_id,note,due_at,status,source
    from jsonb_populate_record(null::public.reminders,p_reminder) returning * into v;
  perform public._persist_domain_event(p_event,v.workspace_id,v.id,array['reminder.created']); return to_jsonb(v);
end $$;

create or replace function public.update_reminder_with_event(p_id uuid,p_workspace uuid,p_reminder jsonb,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.reminders;
begin
  update public.reminders r set note=s.note,due_at=s.due_at
  from jsonb_populate_record(null::public.reminders,p_reminder) s
  where r.id=p_id and r.workspace_id=p_workspace and r.deleted_at is null returning r.* into v;
  if not found then return null; end if;
  perform public._persist_domain_event(p_event,p_workspace,p_id,array['reminder.updated']); return to_jsonb(v);
end $$;

create or replace function public.complete_reminder_with_event(p_id uuid,p_workspace uuid,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.reminders;
begin
  update public.reminders set status='completed',completed_at=(p_event->>'occurred_at')::timestamptz,
    completed_by=auth.uid() where id=p_id and workspace_id=p_workspace and deleted_at is null returning * into v;
  if not found then return null; end if;
  perform public._persist_domain_event(p_event,p_workspace,p_id,array['reminder.completed']); return to_jsonb(v);
end $$;

create or replace function public.snooze_reminder_with_event(p_id uuid,p_workspace uuid,p_until timestamptz,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.reminders;
begin
  update public.reminders set status='snoozed',snoozed_until=p_until
    where id=p_id and workspace_id=p_workspace and deleted_at is null returning * into v;
  if not found then return null; end if;
  perform public._persist_domain_event(p_event,p_workspace,p_id,array['reminder.snoozed']); return to_jsonb(v);
end $$;

create or replace function public.archive_reminder_with_event(p_id uuid,p_workspace uuid,p_event jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  update public.reminders set deleted_at=(p_event->>'occurred_at')::timestamptz
    where id=p_id and workspace_id=p_workspace and deleted_at is null;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event,p_workspace,p_id,array['reminder.archived']); return true;
end $$;

revoke all on function public._persist_domain_event(jsonb,uuid,uuid,text[]) from public;
grant execute on function public._persist_domain_event(jsonb,uuid,uuid,text[]) to authenticated;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%\_with\_event' escape '\'
  loop execute format('revoke all on function %s from public',r.signature);
       execute format('grant execute on function %s to authenticated',r.signature); end loop;
end $$;
