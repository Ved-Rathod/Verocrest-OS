-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 5.0 — Outreach Queue (docs/04 §8.1 AS AMENDED by Amendment 012).
-- Implements the FROZEN `outreach_queue_items` (reused, NOT duplicated) as a
-- materialized, write-locked LIE projection (docs/03 §6.5). Amendment 012:
-- `opportunity_score` is NULLABLE (genuine value; NULL until Relationship
-- Intelligence supplies readiness — Amendment 011). Ranking uses a TRANSIENT
-- effective priority `coalesce(opportunity_score, fit_score)` joined from
-- lead_scores — never a persisted priority column.
--
-- LIE write-lock (docs/03 §6.5, §8): members SELECT; the recompute writes through
-- the service-role path (no INSERT/UPDATE/DELETE policy). Snooze/Complete live in
-- `reminders` (docs/05 §8–9) + a service-role `cooldown_until` here (D3) — no
-- mutable status columns on the projection.
--
-- Deferred to their frozen homes (D1/D9): multi-step sequencing (Phase 2),
-- Relationship Intelligence (relationship.profile.recomputed trigger, S7),
-- outreach.sent trigger (S9). Forward-only.
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if not exists (select 1 from pg_type where typname = 'next_best_action_enum') then
    create type public.next_best_action_enum as enum (
      'draft_email', 'draft_ig_dm', 'draft_linkedin_dm',
      'send_loom', 'schedule_followup', 'wait_cooldown',
      'present_offer', 'disqualify'
    );
  end if;
end $$;

create table if not exists public.outreach_queue_items (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  lead_id               uuid not null references public.leads(id) on delete cascade,
  contact_id            uuid not null references public.contacts(id) on delete cascade,
  company_id            uuid references public.companies(id) on delete set null,
  recommended_offer_id  uuid references public.offers(id),
  -- Amendment 012: nullable — genuine opportunity score (NULL until readiness exists).
  opportunity_score     smallint check (opportunity_score between 0 and 100),
  next_best_action      public.next_best_action_enum not null,
  reasoning             jsonb not null default '{}'::jsonb,   -- D10 explainability
  channel_preference    text,
  cooldown_until        timestamptz,
  computed_at           timestamptz not null default now(),
  expires_at            timestamptz not null,
  priority_rank         integer not null
);

create unique index if not exists uq_outreach_queue_items_ws_lead
  on public.outreach_queue_items (workspace_id, lead_id);
create index if not exists idx_outreach_queue_items_ws_rank
  on public.outreach_queue_items (workspace_id, priority_rank);
create index if not exists idx_outreach_queue_items_ws_score
  on public.outreach_queue_items (workspace_id, opportunity_score desc);
create index if not exists idx_outreach_queue_items_ws_offer
  on public.outreach_queue_items (workspace_id, recommended_offer_id)
  where recommended_offer_id is not null;

-- ── RLS — LIE write-lock (members read; service-role recompute writes) ────────
alter table public.outreach_queue_items enable row level security;
alter table public.outreach_queue_items force row level security;
drop policy if exists outreach_queue_items_tenant_select on public.outreach_queue_items;
create policy outreach_queue_items_tenant_select on public.outreach_queue_items
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- ── Rerank helper: priority_rank over effective_priority = coalesce(opp, fit) ──
-- The effective value is transient (only orders the rank); never stored.
create or replace function public._rerank_outreach_queue(p_workspace uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.outreach_queue_items q
     set priority_rank = r.rn
    from (
      select q2.id,
             row_number() over (
               order by coalesce(q2.opportunity_score, ls.fit_score) desc nulls last,
                        q2.computed_at desc
             ) as rn
        from public.outreach_queue_items q2
        left join public.lead_scores ls
          on ls.workspace_id = q2.workspace_id and ls.lead_id = q2.lead_id
       where q2.workspace_id = p_workspace
    ) r
   where q.id = r.id;
end $$;

-- Upsert one item + rerank the workspace + emit outreach.queue.updated, atomically.
create or replace function public.recompute_queue_item_with_event(p_item jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.outreach_queue_items;
begin
  insert into public.outreach_queue_items (
    workspace_id, lead_id, contact_id, company_id, recommended_offer_id,
    opportunity_score, next_best_action, reasoning, channel_preference,
    cooldown_until, expires_at, priority_rank
  )
  select workspace_id, lead_id, contact_id, company_id, recommended_offer_id,
    opportunity_score, next_best_action, reasoning, channel_preference,
    cooldown_until, expires_at, coalesce(priority_rank, 0)
  from jsonb_populate_record(null::public.outreach_queue_items, p_item)
  on conflict (workspace_id, lead_id) do update set
    contact_id = excluded.contact_id,
    company_id = excluded.company_id,
    recommended_offer_id = excluded.recommended_offer_id,
    opportunity_score = excluded.opportunity_score,
    next_best_action = excluded.next_best_action,
    reasoning = excluded.reasoning,
    channel_preference = excluded.channel_preference,
    cooldown_until = excluded.cooldown_until,
    expires_at = excluded.expires_at,
    computed_at = now()
  returning * into v;

  perform public._rerank_outreach_queue(v.workspace_id);
  perform public._persist_domain_event(p_event, v.workspace_id, v.lead_id, array['outreach.queue.updated']);

  select * into v from public.outreach_queue_items where id = v.id;   -- re-read post-rerank
  return to_jsonb(v);
end $$;

-- Apply a cooldown (snooze/complete) to a lead's item + emit outreach.queue.updated.
create or replace function public.set_queue_cooldown_with_event(
  p_workspace uuid, p_lead uuid, p_until timestamptz, p_event jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.outreach_queue_items
     set cooldown_until = p_until, computed_at = now()
   where workspace_id = p_workspace and lead_id = p_lead;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_lead, array['outreach.queue.updated']);
  return true;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('_rerank_outreach_queue','recompute_queue_item_with_event','set_queue_cooldown_with_event')
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
