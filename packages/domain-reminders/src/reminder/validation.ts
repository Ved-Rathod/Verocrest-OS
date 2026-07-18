import { z } from 'zod';
import { REMINDER_ENTITY_TYPES, REMINDER_STATUSES, SELECTABLE_ENTITY_TYPES } from './enums';

/**
 * Reminder input validation per docs/04 §12 + docs/10 §10 (strict). FormData
 * yields null for absent keys and '' for present-but-empty inputs; both normalize
 * to undefined so optional fields don't mis-fire (Sprint 2.3 pattern).
 */
const emptyToUndefined = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;

const optionalNote = z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional());

// datetime-local ('YYYY-MM-DDTHH:MM') or ISO — must parse to a real instant.
const dueAtField = z
  .string({ required_error: 'Pick a date and time' })
  .min(1, 'Pick a date and time')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date and time');

/** Create: entity target is required and fixed at creation. */
export const reminderCreateSchema = z
  .object({
    entityType: z.enum(SELECTABLE_ENTITY_TYPES, {
      errorMap: () => ({ message: 'Choose what this reminder is about' }),
    }),
    entityId: z.preprocess(
      emptyToUndefined,
      z.string({ required_error: 'Select an item' }).uuid('Select an item'),
    ),
    note: optionalNote,
    dueAt: dueAtField,
  })
  .strict();

export type ReminderCreateInput = z.infer<typeof reminderCreateSchema>;

/** Edit: only the note and due time are mutable; the entity target is immutable. */
export const reminderEditSchema = z
  .object({
    note: optionalNote,
    dueAt: dueAtField,
  })
  .strict();

export type ReminderEditInput = z.infer<typeof reminderEditSchema>;

/** Snooze: a future instant (UI offers 1d / 3d / 1w presets + custom). */
export const reminderSnoozeSchema = z.object({
  until: dueAtField.refine((s) => Date.parse(s) > Date.now(), 'Snooze must be in the future'),
});

export type ReminderSnoozeInput = z.infer<typeof reminderSnoozeSchema>;

export const reminderListParamsSchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(REMINDER_STATUSES).optional()),
  entityType: z.preprocess(emptyToUndefined, z.enum(REMINDER_ENTITY_TYPES).optional()),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(512).optional(),
});

export type ReminderListParams = z.infer<typeof reminderListParamsSchema>;

export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '(root)';
    out[key] ??= issue.message;
  }
  return out;
}
