// @verocrest/domain-auth — identity module (Module 1): auth + workspaces + members.
//
// This index is the CLIENT-SAFE surface: types, constants, schemas, error
// mapping. Server-only code (workspace service, HIBP — anything touching
// next/headers) lives at '@verocrest/domain-auth/server'. Server Actions:
//   @verocrest/domain-auth/actions            (auth)
//   @verocrest/domain-auth/workspace/actions  (workspace)
// FR-IDT-008 / FR-SET-003 action_log writes land with the platform-db sprint.
export { authErrors, mapSupabaseAuthError } from './errors';
export { ok, fail } from './result';
export type { ActionError, ActionResult } from './result';
export {
  emailSchema,
  passwordSchema,
  signInSchema,
  signUpSchema,
  resetRequestSchema,
  updatePasswordSchema,
  toFieldErrors,
} from './validation';

// Workspace (Sprint 1.4) — client-safe pieces only
export {
  WORKSPACE_ROLES,
  WORKSPACE_CURRENCIES,
  toWorkspace,
  workspaceRowSchema,
} from './workspace/types';
export type { Workspace, WorkspaceMembership, WorkspaceRole } from './workspace/types';
export { workspaceSettingsSchema, isValidTimezone } from './workspace/validation';
export type { WorkspaceSettingsInput } from './workspace/validation';
export { defaultWorkspaceName, generateWorkspaceSlug, slugify } from './workspace/slug';
