import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarClockIcon, PencilIcon } from 'lucide-react';
import { getReminderDetailPage } from '@verocrest/domain-reminders/server';
import {
  REMINDER_ENTITY_LABELS,
  REMINDER_STATUS_LABELS,
  isOverdue,
} from '@verocrest/domain-reminders';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';
import { ReminderActions } from '@/components/reminders/reminder-actions';
import { DateTime } from '@/components/reminders/date-time';
import { statusVariant } from '@/components/reminders/reminder-format';

export const metadata: Metadata = { title: 'Reminder' };
export const dynamic = 'force-dynamic';

export default async function ReminderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Failures normalize to RemindersUnavailableError (→ error.tsx); null = not-found.
  const reminder = await getReminderDetailPage(id);
  if (!reminder) notFound();

  const label = reminder.entity?.label ?? 'this item';
  const active = reminder.status === 'pending' || reminder.status === 'snoozed';
  const overdue = isOverdue(reminder);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted">
              {REMINDER_ENTITY_LABELS[reminder.entityType]}
            </span>
            {reminder.entity?.href ? (
              <Link
                href={reminder.entity.href}
                className="truncate text-xl font-semibold text-fg-strong hover:text-primary"
              >
                {label}
              </Link>
            ) : (
              <h1 className="truncate text-xl font-semibold text-fg-strong">{label}</h1>
            )}
            <Badge variant={statusVariant(reminder.status)}>
              {REMINDER_STATUS_LABELS[reminder.status]}
            </Badge>
            {overdue ? <Badge variant="danger">Overdue</Badge> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/reminders/${reminder.id}/edit`}>
            <Button variant="secondary">
              <PencilIcon className="size-4" strokeWidth={1.75} />
              Edit
            </Button>
          </Link>
          <ReminderActions reminderId={reminder.id} label={label} active={active} />
        </div>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-fg-muted">Due</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-fg">
              <CalendarClockIcon className="size-4 text-fg-subtle" strokeWidth={1.75} />
              <DateTime
                iso={reminder.dueAt}
                className={overdue ? 'font-medium text-danger' : undefined}
              />
            </p>
          </div>
          {reminder.snoozedUntil ? (
            <div>
              <p className="text-xs text-fg-muted">Snoozed until</p>
              <p className="mt-0.5 text-sm text-fg">
                <DateTime iso={reminder.snoozedUntil} />
              </p>
            </div>
          ) : null}
          {reminder.completedAt ? (
            <div>
              <p className="text-xs text-fg-muted">Completed</p>
              <p className="mt-0.5 text-sm text-fg">
                <DateTime iso={reminder.completedAt} />
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs text-fg-muted">Created</p>
            <p className="mt-0.5 text-sm text-fg">
              <DateTime iso={reminder.createdAt} />
            </p>
          </div>
        </CardBody>
      </Card>

      {reminder.note ? (
        <Card className="mt-4">
          <CardBody>
            <p className="mb-1 text-xs font-medium text-fg-muted">Note</p>
            <p className="whitespace-pre-wrap text-sm text-fg">{reminder.note}</p>
          </CardBody>
        </Card>
      ) : null}

      {reminder.entity && !reminder.entity.exists ? (
        <p className="mt-4 text-xs text-warning">
          The linked {REMINDER_ENTITY_LABELS[reminder.entityType].toLowerCase()} is no longer
          available (it may have been archived).
        </p>
      ) : null}

      <p className="mt-6 text-xs text-fg-subtle">
        <Link href="/reminders" className="hover:text-fg">
          ← Back to reminders
        </Link>
      </p>
    </div>
  );
}
