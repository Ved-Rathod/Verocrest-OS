// @verocrest/platform-tenancy/server — SERVER-ONLY (imports next/headers).
// The client-safe surface (result envelope) is the package index.
export {
  ACTIVE_WORKSPACE_COOKIE,
  WorkspaceContextError,
  requireWorkspaceContext,
} from './workspace-context';
export type { WorkspaceContext, WorkspaceRole } from './workspace-context';
