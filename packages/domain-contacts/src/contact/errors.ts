import type { ActionError } from '@verocrest/platform-tenancy';

/** Contact error catalogue — canonical codes per docs/10 §10.2, copy per docs/08 §14. */
export const contactErrors = {
  validation: (fieldErrors: Record<string, string>): ActionError => ({
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: 'Some fields need attention.',
    retryable: false,
    fieldErrors,
  }),

  emailTaken: (): ActionError => ({
    code: 'CONTACT_EMAIL_TAKEN',
    category: 'business',
    message: 'A contact with this email already exists in this workspace.',
    retryable: false,
    fieldErrors: { primaryEmail: 'Already used by another contact' },
  }),

  companyNotFound: (): ActionError => ({
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: 'Selected company was not found.',
    retryable: false,
    fieldErrors: { companyId: 'That company no longer exists' },
  }),

  notFound: (): ActionError => ({
    code: 'NOT_FOUND',
    category: 'business',
    message: 'That contact no longer exists.',
    retryable: false,
  }),

  setupMissing: (): ActionError => ({
    code: 'INTEGRATION_DOWN',
    category: 'integration',
    message:
      'The contacts table has not been created yet. Apply supabase/migrations/20260703140000_contacts.sql.',
    retryable: false,
  }),

  notAuthorized: (): ActionError => ({
    code: 'WORKSPACE_NOT_MEMBER',
    category: 'authorization',
    message: 'You do not have access to this workspace.',
    retryable: false,
  }),

  internal: (): ActionError => ({
    code: 'INTERNAL',
    category: 'internal',
    message: 'Something didn’t go through. Try again.',
    retryable: true,
  }),
} as const;

export function mapContactDbError(error: { code?: string; message?: string }): ActionError {
  switch (error.code) {
    case '23505':
      return contactErrors.emailTaken();
    case '42P01':
      return contactErrors.setupMissing();
    case '42501':
    case 'PGRST116':
      return contactErrors.notAuthorized();
    default:
      return contactErrors.internal();
  }
}
