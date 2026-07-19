-- Sprint 4.6: Founder Onboarding (docs/05 §3, docs/07 §9.5). The first-run
-- checklist derives per-item completion from presence-probes (no stored per-item
-- state → automatic resume). Only two pieces of workspace-scoped state persist:
-- dismissal (stops the takeover) and the one-time onboarded stamp (fires
-- workspace.onboarded once). Forward-only; additive.

alter table public.workspaces
  add column if not exists onboarded_at            timestamptz,
  add column if not exists onboarding_dismissed_at timestamptz;

-- Stamp onboarded_at once + journal workspace.onboarded atomically (docs/05 §3.9).
-- Idempotent: the `onboarded_at is null` guard makes a second call a no-op that
-- returns null (no duplicate event). Owner-scoped via the workspaces RLS update
-- policy (security invoker); onboarding actor is the Owner (docs/05 §3).
create or replace function public.mark_workspace_onboarded_with_event(
  p_workspace uuid, p_event jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.workspaces;
begin
  update public.workspaces
    set onboarded_at = now(), updated_at = now()
    where id = p_workspace and onboarded_at is null and deleted_at is null
    returning * into v;
  if not found then return null; end if;
  perform public._persist_domain_event(p_event, v.id, v.id, array['workspace.onboarded']);
  return to_jsonb(v);
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'mark_workspace_onboarded_with_event'
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
