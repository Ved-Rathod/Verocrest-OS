-- Milestone M4: AI Personalization (docs/04 §9.1). Implements the FROZEN
-- `outreach_messages` table (reused as the draft/personalization artifact — D2),
-- plus a single additive `personalization jsonb` column for the structured
-- components (Amendment 010). v0.1 GENERATES + persists structured personalization
-- only; sending/Gmail/reply-classification/sequences remain future milestones (D6).
-- Forward-only.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'outreach_channel_enum') then
    create type public.outreach_channel_enum as enum ('email', 'ig_dm', 'linkedin_dm', 'sms', 'call');
  end if;
  if not exists (select 1 from pg_type where typname = 'outreach_direction_enum') then
    create type public.outreach_direction_enum as enum ('outbound', 'inbound');
  end if;
  if not exists (select 1 from pg_type where typname = 'outreach_status_enum') then
    create type public.outreach_status_enum as enum (
      'draft', 'queued', 'sent', 'opened', 'replied', 'bounced', 'unsubscribed', 'failed'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'outreach_sentiment_enum') then
    create type public.outreach_sentiment_enum as enum ('positive', 'neutral', 'negative', 'objection', 'unsubscribe');
  end if;
end $$;

create table if not exists public.outreach_messages (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  contact_id             uuid not null references public.contacts(id) on delete cascade,
  company_id             uuid references public.companies(id) on delete set null,
  lead_id                uuid references public.leads(id) on delete set null,
  deal_id                uuid, -- FK added when deals land (docs/04 §9.1 note)
  sequence_enrollment_id uuid,
  offer_id               uuid references public.offers(id),
  channel                public.outreach_channel_enum not null,
  direction              public.outreach_direction_enum not null,
  status                 public.outreach_status_enum not null default 'draft',
  subject                text,
  body                   text not null,
  tone                   text,
  model                  text,
  prompt_id              text,
  prompt_version         integer,
  citations              jsonb,
  -- Additive (Amendment 010): the structured personalization components (D2).
  personalization        jsonb,
  sender_user_id         uuid references auth.users(id),
  sender_agent           text,
  provider_message_id    text,
  provider_thread_id     text,
  sent_at                timestamptz,
  replied_at             timestamptz,
  sentiment              public.outreach_sentiment_enum,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

create index if not exists idx_outreach_messages_ws_contact_time
  on public.outreach_messages (workspace_id, contact_id, created_at desc);
create index if not exists idx_outreach_messages_ws_status
  on public.outreach_messages (workspace_id, status);
create index if not exists idx_outreach_messages_ws_company_time
  on public.outreach_messages (workspace_id, company_id, created_at desc) where company_id is not null;

alter table public.outreach_messages enable row level security;
alter table public.outreach_messages force row level security;
drop policy if exists outreach_messages_tenant_select on public.outreach_messages;
create policy outreach_messages_tenant_select on public.outreach_messages for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists outreach_messages_tenant_insert on public.outreach_messages;
create policy outreach_messages_tenant_insert on public.outreach_messages for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

-- Persist a generated personalization draft + emit outreach.draft.generated
-- atomically (docs/03 §8.4; docs/03 §8.3 event row). Business event, journaled.
create or replace function public.create_outreach_draft_with_event(p_message jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.outreach_messages;
begin
  insert into public.outreach_messages (
    id, workspace_id, contact_id, company_id, lead_id, offer_id, channel, direction,
    status, subject, body, tone, model, prompt_id, prompt_version, citations,
    personalization, sender_user_id, metadata
  ) select id, workspace_id, contact_id, company_id, lead_id, offer_id, channel, direction,
    status, subject, body, tone, model, prompt_id, prompt_version, citations,
    personalization, sender_user_id, coalesce(metadata, '{}'::jsonb)
    from jsonb_populate_record(null::public.outreach_messages, p_message) returning * into v;
  perform public._persist_domain_event(p_event, v.workspace_id, v.id, array['outreach.draft.generated']);
  return to_jsonb(v);
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = 'create_outreach_draft_with_event'
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
