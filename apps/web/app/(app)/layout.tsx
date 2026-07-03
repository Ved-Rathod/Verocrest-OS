import type { ReactNode } from 'react';
import { getAuthUser } from '@verocrest/platform-integrations/supabase/server';
import { resolveActiveWorkspace, WorkspaceSetupError } from '@verocrest/domain-auth/server';
import { AppShell } from '@/components/shell/app-shell';
import { WorkspaceProvider } from '@/components/workspace/workspace-provider';

// Session-dependent surfaces are never statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * Authenticated layout: middleware guarantees a session; this resolves (and
 * auto-provisions on first visit) the active workspace per docs/03 §4.1.
 * Tenancy GUCs for business tables arrive with the platform-db sprint.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser();
  const shellUser = {
    email: user?.email ?? null,
    displayName: user?.displayName ?? null,
  };

  try {
    const { active, memberships } = await resolveActiveWorkspace();
    return (
      <WorkspaceProvider active={active} memberships={memberships}>
        <AppShell user={shellUser}>{children}</AppShell>
      </WorkspaceProvider>
    );
  } catch (error) {
    if (error instanceof WorkspaceSetupError) {
      return <SetupIncomplete detail={error.message} />;
    }
    throw error; // real errors go to the error boundary
  }
}

/** Honest failure state when migrations haven't been applied (docs/07 §9.4). */
function SetupIncomplete({ detail }: { detail: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <h1 className="text-xl font-semibold text-fg-strong">Workspace setup incomplete</h1>
      <p className="max-w-lg text-sm text-fg-muted">
        The database schema for workspaces hasn&apos;t been applied to this Supabase project yet.
      </p>
      <code className="max-w-xl rounded-md bg-surface-2 px-3 py-2 font-mono text-xs text-fg-muted">
        {detail}
      </code>
    </div>
  );
}
