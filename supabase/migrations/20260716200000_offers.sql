-- Sprint 4.2: Offer Library (docs/04 §10.6). Second Knowledge-Layer entity;
-- positioning + roi_narrative + deliverables + guarantees are chunked + embedded
-- into memory_vectors (scope 'offer') by the generalized Knowledge Indexer.
-- Forward-only. Same atomic *_with_event pattern as ICP.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'offer_pricing_model_enum') then
    create type public.offer_pricing_model_enum as enum
      ('fixed', 'tiered', 'retainer', 'performance', 'custom');
  end if;
  if not exists (select 1 from pg_type where typname = 'offer_status_enum') then
    create type public.offer_status_enum as enum ('draft', 'active', 'paused', 'retired');
  end if;
end $$;

create table if not exists public.offers (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  slug                 citext not null,
  name                 text not null,
  short_description    text,
  positioning          text,
  target_icp_id        uuid references public.icps(id),
  target_company_size  public.company_size_enum[] not null default '{}',
  target_industries    text[] not null default '{}',
  pricing_model        public.offer_pricing_model_enum not null default 'fixed',
  price                numeric(18,4),
  price_max            numeric(18,4),
  currency             char(3),
  billing_cadence      text,
  deliverables         jsonb not null default '[]'::jsonb,
  guarantees           jsonb not null default '[]'::jsonb,
  roi_narrative        text,
  roi_metrics          jsonb not null default '{}'::jsonb,
  onboarding_steps     jsonb not null default '[]'::jsonb,
  requirements         jsonb not null default '[]'::jsonb,
  status               public.offer_status_enum not null default 'draft',
  version              integer not null default 1,
  is_indexed           boolean not null default false,
  last_indexed_at      timestamptz,
  content_hash         text not null,
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint ck_offers_currency check (currency is null or currency ~ '^[A-Z]{3}$')
);

create unique index if not exists uq_offers_ws_slug_active
  on public.offers (workspace_id, slug) where deleted_at is null;
create unique index if not exists uq_offers_ws_name_version
  on public.offers (workspace_id, name, version) where deleted_at is null;
create index if not exists idx_offers_ws_status
  on public.offers (workspace_id, status) where deleted_at is null;
create index if not exists idx_offers_ws_icp
  on public.offers (workspace_id, target_icp_id) where target_icp_id is not null;
create index if not exists idx_offers_ws_industries
  on public.offers using gin (target_industries);

alter table public.offers enable row level security;
alter table public.offers force row level security;
drop policy if exists offers_tenant_select on public.offers;
create policy offers_tenant_select on public.offers for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists offers_tenant_insert on public.offers;
create policy offers_tenant_insert on public.offers for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
drop policy if exists offers_tenant_update on public.offers;
create policy offers_tenant_update on public.offers for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Create. Emits offer.upserted ONLY when saved active (docs/10 — save-and-activate
-- emits for indexing; a draft save passes a null p_event and skips the event).
create or replace function public.create_offer_with_event(p_offer jsonb, p_event jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.offers;
begin
  insert into public.offers (
    id, workspace_id, slug, name, short_description, positioning, target_icp_id,
    target_company_size, target_industries, pricing_model, price, price_max, currency,
    billing_cadence, deliverables, guarantees, roi_narrative, roi_metrics,
    onboarding_steps, requirements, status, version, content_hash, created_by
  ) select id, workspace_id, slug, name, short_description, positioning, target_icp_id,
    target_company_size, target_industries, pricing_model, price, price_max, currency,
    billing_cadence, deliverables, guarantees, roi_narrative, roi_metrics,
    onboarding_steps, requirements, status, version, content_hash, created_by
    from jsonb_populate_record(null::public.offers, p_offer) returning * into v;
  if p_event is not null then
    perform public._persist_domain_event(p_event, v.workspace_id, v.id, array['offer.upserted']);
  end if;
  return to_jsonb(v);
end $$;

create or replace function public.update_offer_with_event(
  p_id uuid, p_workspace uuid, p_offer jsonb, p_event jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.offers;
begin
  update public.offers c set
    slug=s.slug, name=s.name, short_description=s.short_description, positioning=s.positioning,
    target_icp_id=s.target_icp_id, target_company_size=s.target_company_size,
    target_industries=s.target_industries, pricing_model=s.pricing_model, price=s.price,
    price_max=s.price_max, currency=s.currency, billing_cadence=s.billing_cadence,
    deliverables=s.deliverables, guarantees=s.guarantees, roi_narrative=s.roi_narrative,
    roi_metrics=s.roi_metrics, onboarding_steps=s.onboarding_steps, requirements=s.requirements,
    status=s.status, content_hash=s.content_hash, is_indexed=s.is_indexed, updated_at=now()
  from jsonb_populate_record(null::public.offers, p_offer) s
  where c.id=p_id and c.workspace_id=p_workspace and c.deleted_at is null
  returning c.* into v;
  if not found then return null; end if;
  if p_event is not null then
    perform public._persist_domain_event(p_event, p_workspace, p_id, array['offer.upserted']);
  end if;
  return to_jsonb(v);
end $$;

create or replace function public.set_offer_indexed_with_event(
  p_id uuid, p_workspace uuid, p_event jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.offers set is_indexed=true, last_indexed_at=now()
    where id=p_id and workspace_id=p_workspace and deleted_at is null;
  if not found then return false; end if;
  perform public._persist_domain_event(p_event, p_workspace, p_id, array['offer.indexed']);
  return true;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('create_offer_with_event','update_offer_with_event','set_offer_indexed_with_event')
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
