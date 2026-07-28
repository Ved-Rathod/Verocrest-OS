// @verocrest/domain-reminders/server — SERVER-ONLY RSC read helpers.
export {
  getRemindersPage,
  getReminderDetailPage,
  RemindersUnavailableError,
} from './reminder/queries';
export type { RemindersUnavailableReason } from './reminder/queries';
// Sprint 5.0: the Outreach Queue's snooze/complete actions compose a follow-up
// reminder (system of record for follow-up state) with a queue cooldown (D3).
export { createReminder } from './reminder/service';
export type { ReminderCreateInput } from './reminder/validation';
