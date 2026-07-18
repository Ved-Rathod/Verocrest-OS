import type { Metadata } from 'next';
import { ReminderForm } from '@/components/reminders/reminder-form';

export const metadata: Metadata = { title: 'New reminder' };

export default function NewReminderPage() {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">New reminder</h1>
        <p className="text-sm text-fg-muted">
          Attach a follow-up to a contact, lead, or company and set when it’s due.
        </p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <ReminderForm mode="create" />
      </div>
    </div>
  );
}
