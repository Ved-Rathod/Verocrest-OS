// @verocrest/platform-tenancy — workspace guard + shared action-result envelope.
// This index is the CLIENT-SAFE surface (pure envelope). Server-only tenancy
// guard lives at '@verocrest/platform-tenancy/server'.
export { ok, fail, internalError } from './result';
export type { ActionResult, ActionError, ErrorCategory } from './result';
