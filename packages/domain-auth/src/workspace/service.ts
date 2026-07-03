import { z } from 'zod';
import { cookies } from 'next/headers';
import {
  createSupabaseServerClient,
  getAuthUser,
} from '@verocrest/platform-integrations/supabase/server';
import { defaultWorkspaceName, generateWorkspaceSlug } from './slug';
import {
  toWorkspace,
  workspaceRowSchema,
  WORKSPACE_ROLES,
  type WorkspaceMembership,
  type WorkspaceRole,
} from './types';

/** Active-workspace cookie per docs/03 §4.1 / docs/10 §2.6. */
export const ACTIVE_WORKSPACE_COOKIE = 'vc_active_workspace';

const membershipRowSchema = z.object({
  role: z.enum(WORKSPACE_ROLES),
  workspace: workspaceRowSchema,
});

const provisionResultSchema = workspaceRowSchema.extend({
  role: z.enum(WORKSPACE_ROLES),
});

/** Thrown when workspace infrastructure is missing (migration not applied). */
export class WorkspaceSetupError extends Error {
  constructor(cause: string) {
    super(
      `Workspace infrastructure unavailable: ${cause}. ` +
        'Apply supabase/migrations/20260703120000_workspaces_foundation.sql (see supabase/README.md).',
    );
    this.name = 'WorkspaceSetupError';
  }
}

/** All live memberships for the current user, earliest-joined first. */
export async function listMemberships(): Promise<WorkspaceMembership[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .select(
      'role, joined_at, workspace:workspaces(id, slug, name, timezone, default_currency, locale, plan, created_at)',
    )
    .is('deleted_at', null)
    .order('joined_at', { ascending: true });

  if (error) {
    // 42P01 undefined_table / 42883 undefined_function → migration missing.
    if (error.code === '42P01') throw new WorkspaceSetupError('tables not found');
    throw new Error(`workspace query failed: ${error.code ?? 'unknown'}`);
  }

  const memberships: WorkspaceMembership[] = [];
  for (const raw of data ?? []) {
    const parsed = membershipRowSchema.safeParse(raw);
    if (parsed.success) {
      memberships.push({ ...toWorkspace(parsed.data.workspace), role: parsed.data.role });
    }
  }
  return memberships;
}

/** Auto-provision the default workspace (idempotent server-side; retries slug collisions). */
export async function provisionDefaultWorkspace(): Promise<WorkspaceMembership> {
  const user = await getAuthUser();
  if (!user) throw new Error('not_authenticated');

  const supabase = await createSupabaseServerClient();
  const name = defaultWorkspaceName(user.displayName, user.email);
  const label = user.displayName ?? user.email ?? 'workspace';

  let lastError: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.rpc('provision_default_workspace', {
      p_name: name,
      p_slug: generateWorkspaceSlug(label),
      p_timezone: 'UTC',
      p_currency: 'USD',
    });

    if (!error) {
      const parsed = provisionResultSchema.safeParse(data);
      if (!parsed.success) throw new Error('provision returned an unexpected shape');
      return { ...toWorkspace(parsed.data), role: parsed.data.role };
    }

    if (error.code === '42883' || error.code === '42P01') {
      throw new WorkspaceSetupError('provision function not found');
    }
    if (error.code === '23505') {
      lastError = error.code; // slug collision — retry with fresh suffix
      continue;
    }
    throw new Error(`provisioning failed: ${error.code ?? error.message}`);
  }
  throw new Error(`provisioning failed after retries: ${lastError ?? 'unknown'}`);
}

/**
 * Resolve the active workspace for the current request:
 * cookie → validated membership → earliest membership → auto-provision.
 * Never sets cookies (RSC-safe); switchWorkspace (action) owns cookie writes.
 */
export async function resolveActiveWorkspace(): Promise<{
  active: WorkspaceMembership;
  memberships: WorkspaceMembership[];
}> {
  let memberships = await listMemberships();

  if (memberships.length === 0) {
    const provisioned = await provisionDefaultWorkspace();
    memberships = [provisioned];
  }

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const active = memberships.find((m) => m.id === requested) ?? memberships[0];
  if (!active) throw new Error('no active workspace resolvable');

  return { active, memberships };
}

/** Membership check used by actions before honoring a workspace id. */
export async function requireMembership(workspaceId: string): Promise<{
  membership: WorkspaceMembership;
  role: WorkspaceRole;
}> {
  const memberships = await listMemberships();
  const membership = memberships.find((m) => m.id === workspaceId);
  if (!membership) throw new Error('WORKSPACE_NOT_MEMBER');
  return { membership, role: membership.role };
}
