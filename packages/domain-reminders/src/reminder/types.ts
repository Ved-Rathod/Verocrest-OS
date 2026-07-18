import { z } from 'zod';
import {
  REMINDER_ENTITY_TYPES,
  REMINDER_SOURCES,
  REMINDER_STATUSES,
  type ReminderEntityType,
  type ReminderSource,
  type ReminderStatus,
} from './enums';

/**
 * Reminder read shape per docs/04 §12. Reminders are POLYMORPHIC — entity_type +
 * entity_id point at a contact / lead / company (deal from Sprint 10) with no DB
 * FK, so the display label is resolved separately (see ./entity) and attached as
 * `entity`. A single shape serves both list and detail (the row is small).
 */
export const REMINDER_SELECT =
  'id, entity_type, entity_id, note, due_at, snoozed_until, status, source, completed_at, created_at, updated_at';

export const reminderRowSchema = z.object({
  id: z.string().uuid(),
  entity_type: z.enum(REMINDER_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  note: z.string().nullable(),
  due_at: z.string(),
  snoozed_until: z.string().nullable(),
  status: z.enum(REMINDER_STATUSES),
  source: z.enum(REMINDER_SOURCES),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Resolved display reference to the polymorphic target (see ./entity). */
export type ReminderEntityRef = {
  type: ReminderEntityType;
  id: string;
  label: string;
  sublabel: string | null;
  /** Link to the entity's detail surface; null when the entity is gone or has none. */
  href: string | null;
  exists: boolean;
};

export type Reminder = {
  id: string;
  entityType: ReminderEntityType;
  entityId: string;
  note: string | null;
  dueAt: string;
  snoozedUntil: string | null;
  status: ReminderStatus;
  source: ReminderSource;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Hydrated label for entity_type/entity_id; null until resolved. */
  entity: ReminderEntityRef | null;
};

export function toReminder(row: z.infer<typeof reminderRowSchema>): Reminder {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    note: row.note,
    dueAt: row.due_at,
    snoozedUntil: row.snoozed_until,
    status: row.status,
    source: row.source,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entity: null,
  };
}

/** True when a pending/snoozed reminder's effective due time is in the past. */
export function isOverdue(reminder: Reminder, now: Date = new Date()): boolean {
  if (reminder.status !== 'pending' && reminder.status !== 'snoozed') return false;
  const effective = reminder.snoozedUntil ?? reminder.dueAt;
  const t = Date.parse(effective);
  return !Number.isNaN(t) && t < now.getTime();
}

export type ReminderPage = {
  items: Reminder[];
  nextCursor: string | null;
};
