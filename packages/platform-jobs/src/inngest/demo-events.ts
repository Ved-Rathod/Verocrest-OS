import type { EventName } from '@verocrest/platform-event-bus';

/**
 * Events the Sprint 3.2 demonstration subscribers listen to. Inngest caps a single
 * function at 10 triggers, so the firehose demo watches a representative spread
 * across all four CRM subjects (company / contact / lead / reminder) rather than
 * the full 16-event catalogue. Real subscribers (Sprint 3.3+) each bind only to
 * the specific events they consume, so this cap never constrains production fan-out.
 */
export const DEMO_SUBSCRIBED_EVENTS = [
  'company.created',
  'company.updated',
  'company.merged',
  'contact.created',
  'contact.updated',
  'contact.archived',
  'lead.ingested',
  'lead.status_changed',
  'reminder.created',
  'reminder.completed',
] as const satisfies readonly EventName[];
