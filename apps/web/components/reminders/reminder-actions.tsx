'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckIcon, Trash2Icon } from 'lucide-react';
import { completeReminderAction, snoozeReminderAction } from '@verocrest/domain-reminders/actions';
import { Button } from '@verocrest/ui-kit';
import { SnoozeControl } from './snooze-control';
import { ArchiveReminderDialog } from './archive-reminder-dialog';

/** Reminder detail actions: complete, snooze, archive. */
export function ReminderActions({
  reminderId,
  label,
  active,
}: {
  reminderId: string;
  label: string;
  active: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    const fd = new FormData();
    fd.set('reminderId', reminderId);
    const result = await completeReminderAction(null, fd);
    setBusy(false);
    if (result.data?.reminder) router.refresh();
  }

  async function snooze(untilIso: string) {
    setBusy(true);
    const fd = new FormData();
    fd.set('reminderId', reminderId);
    fd.set('until', untilIso);
    const result = await snoozeReminderAction(null, fd);
    setBusy(false);
    if (result.data?.reminder) router.refresh();
  }

  return (
    <>
      {active ? (
        <>
          <Button variant="secondary" disabled={busy} onClick={complete}>
            <CheckIcon className="size-4" strokeWidth={1.75} />
            Complete
          </Button>
          <SnoozeControl disabled={busy} onSnooze={snooze} />
        </>
      ) : null}
      <Button variant="ghost" aria-label="Archive reminder" onClick={() => setOpen(true)}>
        <Trash2Icon className="size-4" strokeWidth={1.75} />
      </Button>
      <ArchiveReminderDialog
        target={open ? { id: reminderId, label } : null}
        onClose={() => setOpen(false)}
        // The ACTION redirects server-side (redirect + replace) — a client-side
        // replace here can never win: revalidatePath re-renders the deleted
        // detail route into a 404 in the same action response, unmounting this
        // component before the effect runs. onArchived is a defensive fallback
        // only (unreachable while redirectTo is passed).
        redirectTo="/reminders?archived=1"
        onArchived={() => {
          setOpen(false);
          router.replace('/reminders?archived=1');
        }}
      />
    </>
  );
}
