import type { ActionError } from '@verocrest/platform-tenancy';

/** Company error catalogue — canonical codes per docs/10 §10.2, copy per docs/08 §14. */
export const companyErrors = {
  validation: (fieldErrors: Record<string, string>): ActionError => ({
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: 'Some fields need attention.',
    retryable: false,
    fieldErrors,
  }),

  domainTaken: (): ActionError => ({
    code: 'COMPANY_DOMAIN_TAKEN',
    category: 'business',
    message: 'A company with this domain already exists in this workspace.',
    retryable: false,
    fieldErrors: { domain: 'Already used by another company' },
  }),

  notFound: (): ActionError => ({
    code: 'NOT_FOUND',
    category: 'business',
    message: 'That company no longer exists.',
    retryable: false,
  }),

  setupMissing: (): ActionError => ({
    code: 'INTEGRATION_DOWN',
    category: 'integration',
    message:
      'The companies table has not been created yet. Apply supabase/migrations/20260703130000_companies.sql.',
    retryable: false,
  }),

  notAuthorized: (): ActionError => ({
    code: 'WORKSPACE_NOT_MEMBER',
    category: 'authorization',
    message: 'You do not have access to this workspace.',
    retryable: false,
  }),

  // ── Merge (docs/10 §6.1.7) ──────────────────────────────────────────────────
  mergeForbidden: (): ActionError => ({
    code: 'FORBIDDEN',
    category: 'authorization',
    message: 'Only a workspace owner can merge companies.',
    retryable: false,
  }),

  mergeSameCompany: (): ActionError => ({
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: 'Choose a different company to merge into.',
    retryable: false,
    fieldErrors: { targetCompanyId: 'Pick a different company' },
  }),

  mergeTargetNotFound: (): ActionError => ({
    code: 'NOT_FOUND',
    category: 'business',
    message: 'The company you’re merging into no longer exists.',
    retryable: false,
    fieldErrors: { targetCompanyId: 'No longer exists' },
  }),

  internal: (): ActionError => ({
    code: 'INTERNAL',
    category: 'internal',
    message: 'Something didn’t go through. Try again.',
    retryable: true,
  }),
} as const;

/**
 * Map errors raised by the merge_companies() rpc. The function raises named
 * sentinels ('merge_forbidden', etc.); match on the message since the SQLSTATE
 * alone (e.g. 42501) is ambiguous with generic RLS denials.
 */
export function mapMergeError(error: { code?: string; message?: string }): ActionError {
  const m = error.message ?? '';
  if (m.includes('merge_forbidden')) return companyErrors.mergeForbidden();
  if (m.includes('merge_same_company')) return companyErrors.mergeSameCompany();
  if (m.includes('merge_target_not_found')) return companyErrors.mergeTargetNotFound();
  if (m.includes('merge_source_not_found') || m.includes('merge_cross_workspace')) {
    return companyErrors.notFound();
  }
  return mapCompanyDbError(error);
}

/** Map a Supabase/PostgREST error to a canonical ActionError. */
export function mapCompanyDbError(error: { code?: string; message?: string }): ActionError {
  switch (error.code) {
    case '23505': // unique_violation → domain dedupe (docs/10 §6.1.2)
      return companyErrors.domainTaken();
    case '42P01': // undefined_table → migration not applied
      return companyErrors.setupMissing();
    case '42501': // insufficient_privilege → RLS denial
    case 'PGRST116': // no rows where one required
      return companyErrors.notAuthorized();
    default:
      return companyErrors.internal();
  }
}
