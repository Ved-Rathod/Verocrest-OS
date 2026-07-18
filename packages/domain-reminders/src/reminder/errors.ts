import type { ActionError } from '@verocrest/platform-tenancy';

/** Reminder error catalogue — canonical codes per docs/10 §10.2, copy per docs/08 §14. */
export const reminderErrors = {
  validation: (fieldErrors: Record<string, string>): ActionError => ({
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: 'Some fields need attention.',
    retryable: false,
    fieldErrors,
  }),

  // The polymorphic target (contact/lead/company) was not found in this workspace.
  entityNotFound: (): ActionError => ({
    code: 'VALIDATION_ERROR',
    category: 'validation',
    message: 'The selected item was not found.',
    retryable: false,
    fieldErrors: { entityId: 'That item no longer exists' },
  }),

  notFound: (): ActionError => ({
    code: 'NOT_FOUND',
    category: 'business',
    message: 'That reminder no longer exists.',
    retryable: false,
  }),

  setupMissing: (): ActionError => ({
    code: 'INTEGRATION_DOWN',
    category: 'integration',
    message:
      'The reminders table has not been created yet. Apply supabase/migrations/20260703160000_reminders.sql.',
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

export function mapReminderDbError(error: { code?: string; message?: string }): ActionError {
  switch (error.code) {
    case '23503': // foreign_key_violation — workspace/owner vanished mid-flight
      return reminderErrors.entityNotFound();
    case '42P01':
      return reminderErrors.setupMissing();
    case '42501':
    case 'PGRST116':
      return reminderErrors.notAuthorized();
    default:
      return reminderErrors.internal();
  }
}

export function isDbError(e: unknown): e is { code?: string; message?: string } {
  return typeof e === 'object' && e !== null && ('code' in e || 'message' in e);
}
