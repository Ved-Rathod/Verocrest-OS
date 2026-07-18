/** Polymorphic entity target per docs/04 §12 reminder_entity_enum (frozen, rev 2). */
export const REMINDER_ENTITY_TYPES = ['contact', 'lead', 'deal', 'company'] as const;
export type ReminderEntityType = (typeof REMINDER_ENTITY_TYPES)[number];

/**
 * Entity types a human may attach a reminder to in v0.1. 'deal' is in the frozen
 * enum but Deals land Sprint 10 — it is not selectable until then (Amendment 003
 * impact note). Forward-compatible: the DB enum keeps all four.
 */
export const SELECTABLE_ENTITY_TYPES = [
  'contact',
  'lead',
  'company',
] as const satisfies readonly ReminderEntityType[];
export type SelectableEntityType = (typeof SELECTABLE_ENTITY_TYPES)[number];

export const REMINDER_ENTITY_LABELS: Record<ReminderEntityType, string> = {
  contact: 'Contact',
  lead: 'Lead',
  deal: 'Deal',
  company: 'Company',
};

/** docs/04 §12 reminder_status_enum. */
export const REMINDER_STATUSES = ['pending', 'completed', 'snoozed', 'dismissed'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  pending: 'Pending',
  completed: 'Completed',
  snoozed: 'Snoozed',
  dismissed: 'Dismissed',
};

/** docs/04 §12 reminder_source_enum. Only 'manual' is user-created in v0.1
 *  (FR-REM-004 automation/agent reminders are Phase 2). */
export const REMINDER_SOURCES = ['manual', 'automation', 'agent'] as const;
export type ReminderSource = (typeof REMINDER_SOURCES)[number];

/** Snooze presets offered in the UI (docs/06 §6 — 1d / 3d / 1w / custom). */
export const SNOOZE_PRESETS = [
  { key: '1d', label: '1 day', days: 1 },
  { key: '3d', label: '3 days', days: 3 },
  { key: '1w', label: '1 week', days: 7 },
] as const;
