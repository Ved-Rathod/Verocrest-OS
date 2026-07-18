import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getReminderDetailPage } from '@verocrest/domain-reminders/server';
import { REMINDER_ENTITY_LABELS } from '@verocrest/domain-reminders';
import { ReminderForm } from '@/components/reminders/reminder-form';

export const metadata: Metadata = { title: 'Edit reminder' };
export const dynamic = 'force-dynamic';

export default async function EditReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Failures normalize to RemindersUnavailableError (→ error.tsx); null = not-found.
  const reminder = await getReminderDetailPage(id);
  if (!reminder) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Edit reminder</h1>
        <p className="text-sm text-fg-muted">
          {REMINDER_ENTITY_LABELS[reminder.entityType]} · {reminder.entity?.label ?? '—'}
        </p>
      </div>
      <div className="rounded-lg border border-edge-subtle bg-surface p-5">
        <ReminderForm mode="edit" reminderId={reminder.id} initial={reminder} />
      </div>
    </div>
  );
}
