-- Sprint 4.5: Google OAuth Foundation (docs/04 §19, docs/11 §11). Workspace-scoped
-- external OAuth account connections. v0.1 stores identity-only Google grants
-- (openid/email/profile) — Gmail/Calendar/Drive scopes are added by later sprints.
-- Tokens arrive already encrypted (app-side TokenCipher, docs/11 §3.8/§11.2): the
-- DB only ever sees ciphertext bytea. Forward-only; same atomic *_with_event pattern.

create table if not exists public.integration_connections (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.workspaces(id) on delete cascade,
  user_id                 uuid references auth.users(id) on delete cascade,
  provider                text not null,
  external_account_id     text,
  external_account_email  citext,
  encrypted_access_token  bytea not null,
  encrypted_refresh_token bytea,
  token_expires_at        timestamptz,
  scopes                  text[] not null default '{}',
  status                  text not null default 'active',
  last_used_at            timestamptz,
  last_error_at           timestamptz,
  last_error              jsonb,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  revoked_at              timestamptz
);

-- One active connection per (workspace, user, provider); reconnect updates it,
-- disconnect frees it (status flips off 'active') so a later reconnect re-inserts.
create unique index if not exists uq_integration_connections_ws_user_provider
  on public.integration_connections (workspace_id, user_id, provider)
  where status = 'active' and user_id is not null;
create index if not exists idx_integration_connections_ws_provider_status
  on public.integration_connections (workspace_id, provider, status);

alter table public.integration_connections enable row level security;
alter table public.integration_connections force row level security;
drop policy if exists integration_connections_tenant_select on public.integration_connections;
create policy integration_connections_tenant_select on public.integration_connections for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists integration_connections_tenant_insert on public.integration_connections;
create policy integration_connections_tenant_insert on public.integration_connections for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
drop policy if exists integration_connections_tenant_update on public.integration_connections;
create policy integration_connections_tenant_update on public.integration_connections for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Connect (or reconnect) + emit integration.google.connected atomically (docs/11 §11.1).
-- Tokens are bytea params (not in p_conn jsonb — jsonb can't carry bytea). ON CONFLICT
-- on the active partial index makes reconnect idempotent: same row, fresh tokens.
create or replace function public.connect_google_with_event(
  p_id uuid,
  p_workspace uuid,
  p_user uuid,
  p_provider text,
  p_external_account_id text,
  p_external_account_email citext,
  p_enc_access bytea,
  p_enc_refresh bytea,
  p_expires timestamptz,
  p_scopes text[],
  p_metadata jsonb,
  p_event jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.integration_connections;
begin
  insert into public.integration_connections (
    id, workspace_id, user_id, provider, external_account_id, external_account_email,
    encrypted_access_token, encrypted_refresh_token, token_expires_at, scopes,
    status, metadata, revoked_at, last_error, last_error_at, updated_at
  ) values (
    p_id, p_workspace, p_user, p_provider, p_external_account_id, p_external_account_email,
    p_enc_access, p_enc_refresh, p_expires, coalesce(p_scopes, '{}'),
    'active', coalesce(p_metadata, '{}'::jsonb), null, null, null, now()
  )
  on conflict (workspace_id, user_id, provider) where status = 'active' and user_id is not null
  do update set
    external_account_id = excluded.external_account_id,
    external_account_email = excluded.external_account_email,
    encrypted_access_token = excluded.encrypted_access_token,
    encrypted_refresh_token = coalesce(excluded.encrypted_refresh_token, public.integration_connections.encrypted_refresh_token),
    token_expires_at = excluded.token_expires_at,
    scopes = excluded.scopes,
    metadata = excluded.metadata,
    revoked_at = null,
    last_error = null,
    last_error_at = null,
    updated_at = now()
  returning * into v;

  perform public._persist_domain_event(
    p_event, v.workspace_id, v.id, array['integration.google.connected']);
  return to_jsonb(v);
end $$;

-- Disconnect + emit integration.google.disconnected. Soft: flips status to 'revoked'
-- (frees the active unique index) and stamps revoked_at. Provider-side revocation is
-- performed by the adapter before this call (docs/11 §7.3).
create or replace function public.disconnect_google_with_event(
  p_id uuid, p_workspace uuid, p_event jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.integration_connections;
begin
  update public.integration_connections
    set status = 'revoked', revoked_at = now(), updated_at = now()
    where id = p_id and workspace_id = p_workspace and status <> 'revoked'
    returning * into v;
  if not found then return false; end if;
  perform public._persist_domain_event(
    p_event, v.workspace_id, v.id, array['integration.google.disconnected']);
  return true;
end $$;

-- Lazy refresh persistence (docs/11 §11.3). No event (internal token rotation). The
-- UPDATE takes a row lock; a status guard makes a stale/expired write a no-op.
create or replace function public.update_integration_tokens(
  p_id uuid,
  p_workspace uuid,
  p_enc_access bytea,
  p_expires timestamptz
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.integration_connections
    set encrypted_access_token = p_enc_access,
        token_expires_at = p_expires,
        status = 'active',
        last_used_at = now(),
        last_error = null,
        last_error_at = null,
        updated_at = now()
    where id = p_id and workspace_id = p_workspace and status = 'active';
  return found;
end $$;

-- Mark a connection expired when a refresh fails (401) so the UI prompts reconnect.
create or replace function public.expire_integration_connection(
  p_id uuid, p_workspace uuid, p_error jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.integration_connections
    set status = 'expired', last_error = p_error, last_error_at = now(), updated_at = now()
    where id = p_id and workspace_id = p_workspace and status = 'active';
  return found;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('connect_google_with_event','disconnect_google_with_event',
       'update_integration_tokens','expire_integration_connection')
  loop execute format('revoke all on function %s from public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop;
end $$;
