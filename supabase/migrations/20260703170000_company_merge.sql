-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2.5 — Company merge (domain-contacts, docs/06 §3 / docs/10 §6.1.7)
-- Forward-only. Depends on: companies (2.1), contacts (2.2), leads (2.3),
-- workspace_members + is_workspace_member() (1.4).
--
-- Atomic, owner-only, workspace-scoped merge of a duplicate company (source) into
-- a survivor (target): re-parents live contacts + leads, refreshes the contact
-- company_name cache, then soft-deletes the source. Single function = single
-- transaction → all-or-nothing. Naturally idempotent: a second run finds the
-- source already archived and raises (target already owns everything).
--
-- SECURITY INVOKER: every statement runs under the caller's JWT, so membership
-- RLS on companies/contacts/leads is the tenancy backstop. The owner check is
-- explicit here (defense-in-depth) because RLS lets any MEMBER write — merge is
-- owner-only (docs/10 §6.1.7). Role lives in workspace_members (no GUC yet).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.merge_companies(p_source uuid, p_target uuid)
returns table (moved_contacts integer, moved_leads integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ws          uuid;
  v_target_ws   uuid;
  v_target_name text;
  v_contacts    integer := 0;
  v_leads       integer := 0;
begin
  -- 1a. cannot merge a company into itself
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'merge_same_company' using errcode = 'check_violation';
  end if;

  -- 1b. source must exist + be live + be visible to the caller (RLS scopes to the
  --     caller's workspaces, so a non-member sees no row → treated as not found)
  select workspace_id into v_ws
    from public.companies
    where id = p_source and deleted_at is null;
  if v_ws is null then
    raise exception 'merge_source_not_found' using errcode = 'no_data_found';
  end if;

  -- 1c. target must exist + be live + share the SAME workspace as the source
  select workspace_id, name into v_target_ws, v_target_name
    from public.companies
    where id = p_target and deleted_at is null;
  if v_target_ws is null then
    raise exception 'merge_target_not_found' using errcode = 'no_data_found';
  end if;
  if v_target_ws <> v_ws then
    raise exception 'merge_cross_workspace' using errcode = 'raise_exception';
  end if;

  -- 1d. caller must be an OWNER of the workspace (RLS alone only proves membership)
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_ws
      and user_id = auth.uid()
      and role = 'owner'
      and deleted_at is null
  ) then
    raise exception 'merge_forbidden' using errcode = 'insufficient_privilege';
  end if;

  -- 2. re-parent live contacts + refresh the denormalized company_name cache
  update public.contacts
    set company_id = p_target, company_name = v_target_name
    where workspace_id = v_ws and company_id = p_source and deleted_at is null;
  get diagnostics v_contacts = row_count;

  -- 3. re-parent live leads (denormalized company_id from their contact)
  update public.leads
    set company_id = p_target
    where workspace_id = v_ws and company_id = p_source and deleted_at is null;
  get diagnostics v_leads = row_count;

  -- 4. soft-delete the source (04 §1.8) — never hard delete; runs AFTER repoint so
  --    no live child ever references an archived company (no orphans)
  update public.companies
    set deleted_at = now()
    where id = p_source and workspace_id = v_ws and deleted_at is null;

  moved_contacts := v_contacts;
  moved_leads := v_leads;
  return next;
end;
$$;

revoke all on function public.merge_companies(uuid, uuid) from public;
grant execute on function public.merge_companies(uuid, uuid) to authenticated;
