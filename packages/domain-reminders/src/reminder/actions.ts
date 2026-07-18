'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, ok, type ActionResult } from '@verocrest/platform-tenancy';
import { resolveEntity, searchEntities, type EntityOption } from './entity';
import { SELECTABLE_ENTITY_TYPES, type SelectableEntityType } from './enums';
import { reminderErrors, mapReminderDbError } from './errors';
import { parseReminderCreateFormData, parseReminderEditFormData } from './form';
import {
  completeReminder,
  createReminder,
  listReminders,
  snoozeReminder,
  softDeleteReminder,
  updateReminder,
} from './service';
import type { Reminder, ReminderPage } from './types';
import {
  reminderCreateSchema,
  reminderEditSchema,
  reminderListParamsSchema,
  reminderSnoozeSchema,
  toFieldErrors,
} from './validation';

/**
 * Reminder Server Actions (docs/06 §6, docs/10 §10, docs/04 §12). Envelope per
 * docs/10 §10. FormData parsing lives in ./form (pure, unit-tested). No event
 * emission or scheduler wiring — reminder.* events + due-sweep are Event-Bus/S5.
 */

function readId(formData: FormData): string | null {
  const id = formData.get('reminderId');
  return typeof id === 'string' && id !== '' ? id : null;
}

export async function createReminderAction(
  _prev: ActionResult<{ reminder: Reminder }> | null,
  formData: FormData,
): Promise<ActionResult<{ reminder: Reminder }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = reminderCreateSchema.safeParse(parseReminderCreateFormData(formData));
    if (!parsed.success) return fail(reminderErrors.validation(toFieldErrors(parsed.error)));

    // Validate the polymorphic target exists in this workspace before writing.
    const entity = await resolveEntity(ctx, parsed.data.entityType, parsed.data.entityId);
    if (!entity) return fail(reminderErrors.entityNotFound());

    const reminder = await createReminder(ctx, parsed.data);
    revalidatePath('/reminders');
    return ok({ reminder });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(reminderErrors.notAuthorized());
    return fail(mapReminderDbError(error as { code?: string; message?: string }));
  }
}

export async function updateReminderAction(
  _prev: ActionResult<{ reminder: Reminder }> | null,
  formData: FormData,
): Promise<ActionResult<{ reminder: Reminder }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const id = readId(formData);
    if (!id) return fail(reminderErrors.notFound());

    const parsed = reminderEditSchema.safeParse(parseReminderEditFormData(formData));
    if (!parsed.success) return fail(reminderErrors.validation(toFieldErrors(parsed.error)));

    const reminder = await updateReminder(ctx, id, parsed.data);
    if (!reminder) return fail(reminderErrors.notFound());
    revalidatePath('/reminders');
    revalidatePath(`/reminders/${id}`);
    revalidatePath(`/reminders/${id}/edit`);
    return ok({ reminder });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(reminderErrors.notAuthorized());
    return fail(mapReminderDbError(error as { code?: string; message?: string }));
  }
}

export async function completeReminderAction(
  _prev: ActionResult<{ reminder: Reminder }> | null,
  formData: FormData,
): Promise<ActionResult<{ reminder: Reminder }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const id = readId(formData);
    if (!id) return fail(reminderErrors.notFound());

    const reminder = await completeReminder(ctx, id);
    if (!reminder) return fail(reminderErrors.notFound());
    revalidatePath('/reminders');
    revalidatePath(`/reminders/${id}`);
    return ok({ reminder });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(reminderErrors.notAuthorized());
    return fail(mapReminderDbError(error as { code?: string; message?: string }));
  }
}

export async function snoozeReminderAction(
  _prev: ActionResult<{ reminder: Reminder }> | null,
  formData: FormData,
): Promise<ActionResult<{ reminder: Reminder }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const id = readId(formData);
    if (!id) return fail(reminderErrors.notFound());

    const parsed = reminderSnoozeSchema.safeParse({ until: formData.get('until') });
    if (!parsed.success) return fail(reminderErrors.validation(toFieldErrors(parsed.error)));

    const reminder = await snoozeReminder(ctx, id, parsed.data.until);
    if (!reminder) return fail(reminderErrors.notFound());
    revalidatePath('/reminders');
    revalidatePath(`/reminders/${id}`);
    return ok({ reminder });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(reminderErrors.notAuthorized());
    return fail(mapReminderDbError(error as { code?: string; message?: string }));
  }
}

export async function archiveReminderAction(
  _prev: ActionResult<{ deleted: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ deleted: boolean }>> {
  // Archive-from-DETAIL must leave the page SERVER-SIDE. Two traps (Sprint 2.4 QA):
  // 1. revalidatePath in an action re-renders the CURRENT route in the same
  //    response — the soft-deleted detail page hits notFound() and a 404 commits
  //    in place before any client effect can router.replace(). So when a
  //    redirect is requested we skip revalidatePath entirely (the list is
  //    force-dynamic; the redirect fetches it fresh) and navigate via redirect()
  //    with RedirectType.replace, dropping the dead detail URL from history.
  // 2. redirect() throws NEXT_REDIRECT — it must live OUTSIDE the try/catch or
  //    the catch would swallow the navigation and return a false error envelope.
  // Same-origin relative paths only (guards a tampered hidden field). The LIST
  // dialog sends no redirectTo: it stays in place (optimistic row removal) and
  // gets the revalidatePath purge instead.
  const rawRedirect = formData.get('redirectTo');
  const redirectTo =
    typeof rawRedirect === 'string' && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : null;

  try {
    const ctx = await requireWorkspaceContext();
    const id = readId(formData);
    if (!id) return fail(reminderErrors.notFound());

    const deleted = await softDeleteReminder(ctx, id);
    if (!deleted) return fail(reminderErrors.notFound());
    if (!redirectTo) revalidatePath('/reminders');
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(reminderErrors.notAuthorized());
    return fail(mapReminderDbError(error as { code?: string; message?: string }));
  }

  if (redirectTo) redirect(redirectTo, RedirectType.replace);
  return ok({ deleted: true });
}

/** Entity typeahead for the create-form picker (contact / lead / company). */
export async function searchReminderEntitiesAction(
  entityType: string,
  query: string,
): Promise<ActionResult<{ options: EntityOption[] }>> {
  try {
    const ctx = await requireWorkspaceContext();
    if (!SELECTABLE_ENTITY_TYPES.includes(entityType as SelectableEntityType)) {
      return fail(reminderErrors.validation({ entityType: 'Unsupported type' }));
    }
    const options = await searchEntities(ctx, entityType as SelectableEntityType, query, 10);
    return ok({ options });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(reminderErrors.notAuthorized());
    return fail(mapReminderDbError(error as { code?: string; message?: string }));
  }
}

/** "Load more" pagination for the client table (docs/10 §12.3). */
export async function loadRemindersPageAction(rawParams: {
  status?: string;
  entityType?: string;
  cursor?: string;
}): Promise<ActionResult<ReminderPage>> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = reminderListParamsSchema.safeParse(rawParams);
    if (!parsed.success) return fail(reminderErrors.validation(toFieldErrors(parsed.error)));
    const page = await listReminders(ctx, parsed.data);
    return ok(page);
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(reminderErrors.notAuthorized());
    return fail(mapReminderDbError(error as { code?: string; message?: string }));
  }
}
