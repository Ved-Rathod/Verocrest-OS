import { cookies } from 'next/headers';
import {
  createSupabaseServerClient,
  getAuthUser,
} from '@verocrest/platform-integrations/supabase/server';

/**
 * The active-workspace cookie (docs/03 §4.1). MUST equal domain-auth's
 * ACTIVE_WORKSPACE_COOKIE — the workspace switcher (domain-auth) writes it,
 * this guard reads it. Both are the literal 'vc_active_workspace'.
 */
export const ACTIVE_WORKSPACE_COOKIE = 'vc_active_workspace';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';

export type WorkspaceContext = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
};

export class WorkspaceContextError extends Error {
  constructor(reason: string) {
    super(`workspace context unavailable: ${reason}`);
    this.name = 'WorkspaceContextError';
  }
}

/**
 * Resolve the active workspace for the current request — the tenancy guard
 * (Arch §5: platform-tenancy owns the "workspace guard"). Fail-closed: throws
 * if there is no session or membership. Selection matches the (app) layout
 * (cookie → earliest membership) so every surface agrees on the active tenant.
 *
 * Does NOT provision (the layout already did on first visit) and does NOT set
 * cookies (RSC-safe; the switch action owns cookie writes).
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const user = await getAuthUser();
  if (!user) throw new WorkspaceContextError('not authenticated');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, joined_at')
    .is('deleted_at', null)
    .order('joined_at', { ascending: true });

  if (error)
    throw new WorkspaceContextError(`membership query failed (${error.code ?? 'unknown'})`);
  if (!data || data.length === 0) throw new WorkspaceContextError('no workspace membership');

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const active = data.find((m) => m.workspace_id === requested) ?? data[0];
  if (!active) throw new WorkspaceContextError('no active workspace resolvable');

  return {
    workspaceId: active.workspace_id as string,
    userId: user.id,
    role: active.role as WorkspaceRole,
  };
}
