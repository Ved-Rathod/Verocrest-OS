-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 4.9 — AI Lead Scoring (docs/04 §5.2–5.5 AS AMENDED by Amendment 011).
-- Implements the FROZEN scoring tables — scoring_rubrics, lead_scores,
-- lead_score_history — reused, NOT duplicated. Amendment 011 relaxes
-- readiness_score/opportunity_score to NULLABLE (composed only from dimensions
-- that genuinely exist — never fabricated) and adds `score_version` (the scoring
-- ALGORITHM version, distinct from the workspace rubric_version) so historical
-- rows stay explainable after future algorithm revisions.
--
-- LIE write-lock (docs/04 §5.3, roadmap S7 DoD): members SELECT only; the
-- deterministic scoring engine writes through the service-role path (no
-- INSERT/UPDATE/DELETE policy), so `app_role_features` INSERT fails at Postgres.
--
-- Deferred to Sprint 7 (per approved D1): enrichment, Relationship Intelligence
-- (relationship_profiles → readiness/opportunity), the Outreach Queue, and the
-- full auto-trigger event chain. Forward-only.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── scoring_rubrics (docs/04 §5.2) ───────────────────────────────────────────
create table if not exists public.scoring_rubrics (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  version       integer not null,
  definition    jsonb not null,
  active        boolean not null default false,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index if not exists uq_scoring_rubrics_ws_name_version
  on public.scoring_rubrics (workspace_id, name, version) where deleted_at is null;

create unique index if not exists uq_scoring_rubrics_ws_active
  on public.scoring_rubrics (workspace_id) where active = true and deleted_at is null;

-- ── lead_scores (docs/04 §5.3 as amended by Amendment 011) ───────────────────
create table if not exists public.lead_scores (
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  lead_id            uuid not null references public.leads(id) on delete cascade,
  fit_score          smallint not null check (fit_score between 0 and 100),
  -- Amendment 011: nullable — NULL when the dimension has no genuine inputs
  -- (readiness before Relationship Intelligence ships). Never fabricated.
  readiness_score    smallint check (readiness_score between 0 and 100),
  opportunity_score  smallint check (opportunity_score between 0 and 100),
  icp_id             uuid references public.icps(id),
  icp_match_score    smallint check (icp_match_score between 0 and 100),
  icp_match_signals  jsonb,
  rubric_id          uuid not null references public.scoring_rubrics(id),
  rubric_version     integer not null,
  score_version      integer not null default 1,   -- Amendment 011: algorithm version
  top_signals        jsonb not null,
  explainability     jsonb not null,
  model              text not null,
  computed_at        timestamptz not null default now(),
  computed_by_agent  text,
  primary key (workspace_id, lead_id)
);

create index if not exists idx_lead_scores_ws_opportunity
  on public.lead_scores (workspace_id, opportunity_score desc);
create index if not exists idx_lead_scores_ws_readiness
  on public.lead_scores (workspace_id, readiness_score desc);
create index if not exists idx_lead_scores_ws_icp
  on public.lead_scores (workspace_id, icp_id) where icp_id is not null;

-- ── lead_score_history (docs/04 §5.4 as amended, append-only) ────────────────
create table if not exists public.lead_score_history (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null,
  lead_id            uuid not null,
  fit_score          smallint not null,
  readiness_score    smallint,                     -- Amendment 011: nullable mirror
  opportunity_score  smallint,
  icp_id             uuid,
  icp_match_score    smallint,
  rubric_id          uuid not null,
  rubric_version     integer not null,
  score_version      integer not null default 1,   -- Amendment 011: algorithm version
  top_signals        jsonb not null,
  model              text not null,
  computed_at        timestamptz not null default now(),
  computed_by_agent  text
);

create index if not exists idx_lead_score_history_ws_lead_time
  on public.lead_score_history (workspace_id, lead_id, computed_at desc);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- All three are LIE-owned. Members read; the service-role scoring engine writes.
-- No INSERT/UPDATE/DELETE policy → a member (any app_role) INSERT is rejected by
-- Postgres, realizing the frozen write-lock.
alter table public.scoring_rubrics enable row level security;
alter table public.scoring_rubrics force row level security;
drop policy if exists scoring_rubrics_tenant_select on public.scoring_rubrics;
create policy scoring_rubrics_tenant_select on public.scoring_rubrics for select to authenticated
  using (public.is_workspace_member(workspace_id));

alter table public.lead_scores enable row level security;
alter table public.lead_scores force row level security;
drop policy if exists lead_scores_tenant_select on public.lead_scores;
create policy lead_scores_tenant_select on public.lead_scores for select to authenticated
  using (public.is_workspace_member(workspace_id));

alter table public.lead_score_history enable row level security;
alter table public.lead_score_history force row level security;
drop policy if exists lead_score_history_tenant_select on public.lead_score_history;
create policy lead_score_history_tenant_select on public.lead_score_history for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- ── RPCs ─────────────────────────────────────────────────────────────────────
-- Ensure a workspace has an active scoring rubric; create the pre-ICP-capable
-- default (docs/04 §5.5 shape) on first score. Returns the active rubric so the
-- engine can read its fit_composition/readiness_rules/disqualifiers. Called from
-- the service-role scoring path (bypasses RLS); idempotent.
create or replace function public.ensure_default_scoring_rubric(p_workspace uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.scoring_rubrics;
begin
  select * into v from public.scoring_rubrics
    where workspace_id = p_workspace and active = true and deleted_at is null
    limit 1;
  if found then return to_jsonb(v); end if;

  insert into public.scoring_rubrics (workspace_id, name, version, definition, active)
  values (
    p_workspace, 'Default', 1,
    jsonb_build_object(
      'fit_composition', jsonb_build_object(
        'icp_match_weight', 0.6, 'website_signal_weight', 0.2, 'enrichment_weight', 0.2
      ),
      'readiness_rules', jsonb_build_array(),
      'opportunity_formula', 'sqrt(fit * readiness)',
      'disqualifiers', jsonb_build_array()
    ),
    true
  )
  on conflict do nothing
  returning * into v;

  if v.id is null then
    select * into v from public.scoring_rubrics
      where workspace_id = p_workspace and active = true and deleted_at is null
      limit 1;
  end if;
  return to_jsonb(v);
end $$;

-- Persist a computed score (upsert lead_scores + append lead_score_history) and
-- emit lead.scored, all in one transaction (docs/03 §8.4 atomic *_with_event).
-- readiness_score/opportunity_score arrive NULL when their dimension is absent.
create or replace function public.score_lead_with_event(p_score jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.lead_scores;
begin
  insert into public.lead_scores (
    workspace_id, lead_id, fit_score, readiness_score, opportunity_score,
    icp_id, icp_match_score, icp_match_signals, rubric_id, rubric_version,
    score_version, top_signals, explainability, model, computed_by_agent
  )
  select workspace_id, lead_id, fit_score, readiness_score, opportunity_score,
    icp_id, icp_match_score, icp_match_signals, rubric_id, rubric_version,
    score_version, top_signals, explainability, model, computed_by_agent
  from jsonb_populate_record(null::public.lead_scores, p_score)
  on conflict (workspace_id, lead_id) do update set
    fit_score = excluded.fit_score,
    readiness_score = excluded.readiness_score,
    opportunity_score = excluded.opportunity_score,
    icp_id = excluded.icp_id,
    icp_match_score = excluded.icp_match_score,
    icp_match_signals = excluded.icp_match_signals,
    rubric_id = excluded.rubric_id,
    rubric_version = excluded.rubric_version,
    score_version = excluded.score_version,
    top_signals = excluded.top_signals,
    explainability = excluded.explainability,
    model = excluded.model,
    computed_by_agent = excluded.computed_by_agent,
    computed_at = now()
  returning * into v;

  insert into public.lead_score_history (
    workspace_id, lead_id, fit_score, readiness_score, opportunity_score,
    icp_id, icp_match_score, rubric_id, rubric_version, score_version,
    top_signals, model, computed_by_agent
  ) values (
    v.workspace_id, v.lead_id, v.fit_score, v.readiness_score, v.opportunity_score,
    v.icp_id, v.icp_match_score, v.rubric_id, v.rubric_version, v.score_version,
    v.top_signals, v.model, v.computed_by_agent
  );

  perform public._persist_domain_event(p_event, v.workspace_id, v.lead_id, array['lead.scored']);
  return to_jsonb(v);
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('ensure_default_scoring_rubric','score_lead_with_event')
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
