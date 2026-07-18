import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { isDbError } from './errors';
import { getReminder, listReminders } from './service';
import type { Reminder, ReminderPage } from './types';
import { reminderListParamsSchema, type ReminderListParams } from './validation';

/** RSC read helpers with friendly failure normalization (setup / access / unknown). */
export type RemindersUnavailableReason = 'setup' | 'access' | 'unknown';

export class RemindersUnavailableError extends Error {
  readonly reason: RemindersUnavailableReason;
  constructor(reason: RemindersUnavailableReason) {
    super(`reminders unavailable: ${reason}`);
    this.name = 'RemindersUnavailableError';
    this.reason = reason;
  }
}

function normalize(error: unknown): RemindersUnavailableError {
  if (error instanceof WorkspaceContextError) return new RemindersUnavailableError('access');
  if (isDbError(error)) {
    if (error.code === '42P01') return new RemindersUnavailableError('setup');
    if (error.code === '42501') return new RemindersUnavailableError('access');
  }
  return new RemindersUnavailableError('unknown');
}

export async function getRemindersPage(
  params: Partial<ReminderListParams> = {},
): Promise<ReminderPage> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = reminderListParamsSchema.parse(params);
    return await listReminders(ctx, parsed);
  } catch (error) {
    throw normalize(error);
  }
}

export async function getReminderDetailPage(id: string): Promise<Reminder | null> {
  try {
    const ctx = await requireWorkspaceContext();
    return await getReminder(ctx, id);
  } catch (error) {
    throw normalize(error);
  }
}
