# supabase/

Database migrations for Verocrest OS. Schema authority is `docs/04_Database_Design.md`;
these SQL files implement it. Forward-only, per `docs/12_Infrastructure_Deployment.md` §13.

> Tooling note: migrations are SQL-first for now. Drizzle schema definitions land with
> the platform-db build and must match this SQL exactly (`docs/04` §0: the SQL is
> authoritative when in doubt).

## Applying migrations

**Option A — Supabase CLI (recommended; tracked + repeat-safe):**

```bash
npm install -g supabase            # or: scoop install supabase
supabase login
supabase link --project-ref <your-project-ref>   # from the dashboard URL
supabase db push                   # applies pending files in ./migrations
```

**Option B — Dashboard SQL editor (one-off):**

Open the Supabase Dashboard → SQL Editor → paste the migration file → Run.
Apply each file exactly once, in filename order.

## Verifying

After applying, paste this block into the SQL editor. Every check names its
expected result; if any row is missing, the migration did not fully apply.

```sql
-- 1) Tables + RLS: expect 3 rows, all rowsecurity = true
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename like 'workspace%'
 order by tablename;
-- workspace_invites | t
-- workspace_members | t
-- workspaces        | t

-- 2) Role enum: expect owner, admin, member, guest
select enumlabel from pg_enum e
  join pg_type t on t.oid = e.enumtypid
 where t.typname = 'workspace_role_enum'
 order by e.enumsortorder;

-- 3) Provision function: expect exactly one row, secdef = true
select proname, prosecdef as secdef from pg_proc
 where proname = 'provision_default_workspace';

-- 4) Policies: expect 3 rows
--    workspaces_select_member | workspaces_update_owner | workspace_members_select_own
select tablename, policyname from pg_policies
 where schemaname = 'public' and tablename like 'workspace%'
 order by tablename, policyname;

-- 5) Trigger function: expect one row
select proname from pg_proc where proname = 'set_updated_at';
```

Then reload the app while signed in: the sidebar should show your
auto-provisioned workspace, and these should return one row each:

```sql
select id, slug, name from public.workspaces;
select workspace_id, user_id, role from public.workspace_members;
```

(The SQL editor runs as the `postgres` role, which has `bypassrls` on
Supabase — that's why it can see all rows despite FORCE RLS. Application
clients authenticate as `authenticated` and are policy-bound.)
