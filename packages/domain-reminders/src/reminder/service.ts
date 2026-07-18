import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { decodeCursor, encodeCursor } from './cursor';
import { hydrateEntities } from './entity';
import {
  REMINDER_SELECT,
  reminderRowSchema,
  toReminder,
  type Reminder,
  type ReminderPage,
} from './types';
import type { ReminderCreateInput, ReminderEditInput, ReminderListParams } from './validation';

/**
 * Reminder repository (docs/06 §6, docs/10 §10, docs/04 §12). Server-only;
 * explicit WorkspaceContext; workspace_id scoping with RLS backstop. Ordered
 * (due_at asc, id asc) — soonest-due first. Display labels for the polymorphic
 * target are hydrated via ./entity.
 */

async function hydrateOne(
  ctx: WorkspaceContext,
  reminder: Reminder | null,
): Promise<Reminder | null> {
  if (!reminder) return null;
  const [hydrated] = await hydrateEntities(ctx, [reminder]);
  return hydrated ?? reminder;
}

export async function listReminders(
  ctx: WorkspaceContext,
  params: ReminderListParams,
): Promise<ReminderPage> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('reminders')
    .select(REMINDER_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .is('deleted_at', null);

  if (params.status) query = query.eq('status', params.status);
  if (params.entityType) query = query.eq('entity_type', params.entityType);

  const cursor = decodeCursor(params.cursor);
  if (cursor) {
    query = query.or(`due_at.gt.${cursor.dueAt},and(due_at.eq.${cursor.dueAt},id.gt.${cursor.id})`);
  }

  query = query
    .order('due_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(params.pageSize + 1);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((r) => toReminder(reminderRowSchema.parse(r)));
  const hasMore = rows.length > params.pageSize;
  const items = hasMore ? rows.slice(0, params.pageSize) : rows;
  const last = items.at(-1);
  const nextCursor = hasMore && last ? encodeCursor({ dueAt: last.dueAt, id: last.id }) : null;

  return { items: await hydrateEntities(ctx, items), nextCursor };
}

export async function getReminder(ctx: WorkspaceContext, id: string): Promise<Reminder | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('reminders')
    .select(REMINDER_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data ? hydrateOne(ctx, toReminder(reminderRowSchema.parse(data))) : null;
}

export async function createReminder(
  ctx: WorkspaceContext,
  input: ReminderCreateInput,
): Promise<Reminder> {
  const supabase = await createSupabaseServerClient();
  const id = crypto.randomUUID();
  const dueAt = new Date(input.dueAt).toISOString();
  const event = buildEvent({
    name: 'reminder.created',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { reminder_id: id, entity_type: input.entityType, due_at: dueAt },
  });
  const { data, error } = await supabase.rpc('create_reminder_with_event', {
    p_reminder: {
      id,
      workspace_id: ctx.workspaceId,
      owner_user_id: ctx.userId, // insert-only; preserved across edits
      entity_type: input.entityType,
      entity_id: input.entityId,
      note: input.note ?? null,
      due_at: dueAt,
      status: 'pending',
      source: 'manual',
    },
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  const reminder = await hydrateOne(ctx, toReminder(reminderRowSchema.parse(data)));
  return reminder ?? toReminder(reminderRowSchema.parse(data));
}

export async function updateReminder(
  ctx: WorkspaceContext,
  id: string,
  input: ReminderEditInput,
): Promise<Reminder | null> {
  const supabase = await createSupabaseServerClient();
  const dueAt = new Date(input.dueAt).toISOString();
  const event = buildEvent({
    name: 'reminder.updated',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { reminder_id: id, changed_fields: ['note', 'due_at'] },
  });
  const { data, error } = await supabase.rpc('update_reminder_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_reminder: { note: input.note ?? null, due_at: dueAt },
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (!data) return null;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return hydrateOne(ctx, toReminder(reminderRowSchema.parse(data)));
}

/** Mark done (docs/06 §6 completeReminder). Stamps completed_at + completed_by. */
export async function completeReminder(
  ctx: WorkspaceContext,
  id: string,
): Promise<Reminder | null> {
  const supabase = await createSupabaseServerClient();
  const completedAt = new Date().toISOString();
  const event = buildEvent({
    name: 'reminder.completed',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { reminder_id: id, completed_at: completedAt },
    occurredAt: completedAt,
  });
  const { data, error } = await supabase.rpc('complete_reminder_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (!data) return null;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return hydrateOne(ctx, toReminder(reminderRowSchema.parse(data)));
}

/** Snooze to a future instant (docs/06 §6 snoozeReminder). */
export async function snoozeReminder(
  ctx: WorkspaceContext,
  id: string,
  until: string,
): Promise<Reminder | null> {
  const supabase = await createSupabaseServerClient();
  const snoozedUntil = new Date(until).toISOString();
  const event = buildEvent({
    name: 'reminder.snoozed',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { reminder_id: id, snoozed_until: snoozedUntil },
  });
  const { data, error } = await supabase.rpc('snooze_reminder_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_until: snoozedUntil,
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (!data) return null;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return hydrateOne(ctx, toReminder(reminderRowSchema.parse(data)));
}

/** Archive (soft delete) per docs/04 §1.8. */
export async function softDeleteReminder(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const archivedAt = new Date().toISOString();
  const event = buildEvent({
    name: 'reminder.archived',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { reminder_id: id, archived_at: archivedAt },
    occurredAt: archivedAt,
  });
  const { data, error } = await supabase.rpc('archive_reminder_with_event', {
    p_id: id,
    p_workspace: ctx.workspaceId,
    p_event: journalRowFromEnvelope(event),
  });

  if (error) throw error;
  if (data !== true) return false;
  await publishToBus(event); // post-commit fan-out (docs/10 §11.3)
  return true;
}
