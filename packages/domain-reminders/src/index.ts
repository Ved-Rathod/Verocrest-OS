// @verocrest/domain-reminders — Follow-up reminders (Module 5 surface, docs/06 §6).
// Landed Sprint 2.4 per docs/04 §12 (FR-REM-001/002/003) + Amendment 003 (nav).
// Automation/agent reminders (FR-REM-004), reminder.* events, and the due-sweep
// scheduler are Event-Bus / Sprint-5 concerns and are NOT implemented here.
//
// CLIENT-SAFE surface. Server Actions: './actions'. RSC reads: './server'.
export {
  REMINDER_ENTITY_TYPES,
  SELECTABLE_ENTITY_TYPES,
  REMINDER_ENTITY_LABELS,
  REMINDER_STATUSES,
  REMINDER_STATUS_LABELS,
  REMINDER_SOURCES,
  SNOOZE_PRESETS,
} from './reminder/enums';
export type {
  ReminderEntityType,
  SelectableEntityType,
  ReminderStatus,
  ReminderSource,
} from './reminder/enums';
export { isOverdue } from './reminder/types';
export type { Reminder, ReminderEntityRef, ReminderPage } from './reminder/types';
export type { EntityOption } from './reminder/entity';
export {
  reminderCreateSchema,
  reminderEditSchema,
  reminderSnoozeSchema,
  reminderListParamsSchema,
  toFieldErrors,
} from './reminder/validation';
export type {
  ReminderCreateInput,
  ReminderEditInput,
  ReminderSnoozeInput,
  ReminderListParams,
} from './reminder/validation';
