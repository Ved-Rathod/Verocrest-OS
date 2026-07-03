// @verocrest/domain-auth/server — SERVER-ONLY surface (imports next/headers).
// Never import this from client components; the client-safe surface is the
// package index (types, constants, schemas, error mapping).
export {
  ACTIVE_WORKSPACE_COOKIE,
  WorkspaceSetupError,
  listMemberships,
  provisionDefaultWorkspace,
  resolveActiveWorkspace,
  requireMembership,
} from './workspace/service';
export { isPasswordBreached } from './hibp';
