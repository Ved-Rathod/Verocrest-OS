import type { ActionError } from '@verocrest/platform-tenancy';

/** Lead error catalogue — canonical codes per docs/10 §10.2, copy per docs/08 §14. */
export const leadErrors = {
  validation: (fieldErrors: Record<string, string>): ActionError => ({
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: 'Some fields need attention.',
    retryable: false,
    fieldErrors,
  }),

  contactNotFound: (): ActionError => ({
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: 'Selected contact was not found.',
    retryable: false,
    fieldErrors: { contactId: 'That contact no longer exists' },
  }),

  // 23505 on uq_leads_ws_contact_active (docs/10 §10.2 LEAD_EXISTS_FOR_CONTACT)
  leadExistsForContact: (): ActionError => ({
    code: 'LEAD_EXISTS_FOR_CONTACT',
    category: 'business',
    message: 'This contact already has an active lead. Open it instead.',
    retryable: false,
    fieldErrors: { contactId: 'Already has an active lead' },
  }),

  notFound: (): ActionError => ({
    code: 'NOT_FOUND',
    category: 'business',
    message: 'That lead no longer exists.',
    retryable: false,
  }),

  setupMissing: (): ActionError => ({
    code: 'INTEGRATION_DOWN',
    category: 'integration',
    message:
      'The leads table has not been created yet. Apply supabase/migrations/20260703150000_leads.sql.',
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

export function mapLeadDbError(error: { code?: string; message?: string }): ActionError {
  switch (error.code) {
    case '23505':
      return leadErrors.leadExistsForContact();
    case '23503': // foreign_key_violation — contact/company vanished mid-flight
      return leadErrors.contactNotFound();
    case '42P01':
      return leadErrors.setupMissing();
    case '42501':
    case 'PGRST116':
      return leadErrors.notAuthorized();
    default:
      return leadErrors.internal();
  }
}
