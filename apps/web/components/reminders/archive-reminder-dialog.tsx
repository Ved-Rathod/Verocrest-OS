'use client';

import { useActionState, useEffect, useRef } from 'react';
import { archiveReminderAction } from '@verocrest/domain-reminders/actions';
import { Button } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';

/**
 * Archive confirmation per docs/07 §6.6 — names the consequence.
 * `redirectTo` (detail context only): the ACTION navigates server-side via
 * redirect(..., replace) on success — required because the action's
 * revalidatePath re-renders the current (now-deleted) detail route into a 404
 * before any client-side navigation can run. The list context omits it and
 * stays in place (onArchived removes the row).
 */
export function ArchiveReminderDialog({
  target,
  onClose,
  onArchived,
  redirectTo,
}: {
  target: { id: string; label: string } | null;
  onClose: () => void;
  onArchived: (id: string) => void;
  redirectTo?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(archiveReminderAction, null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
  }, [target]);

  useEffect(() => {
    if (state?.data?.deleted && target) onArchived(target.id);
  }, [state, target, onArchived]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
      className="m-auto w-full max-w-md rounded-lg border border-edge-subtle bg-surface-3 p-0 text-fg shadow-xl backdrop:bg-overlay"
    >
      {target ? (
        <div className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-base font-semibold text-fg-strong">Archive this reminder?</h2>
            <p className="mt-1 text-sm text-fg-muted">
              The reminder for <span className="font-medium text-fg">{target.label}</span> will be
              archived. This can’t be undone from here.
            </p>
          </div>

          {state?.error ? <FormError message={state.error.message} /> : null}

          <form action={formAction} className="flex items-center justify-end gap-2">
            <input type="hidden" name="reminderId" value={target.id} />
            {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" disabled={pending}>
              {pending ? 'Archiving…' : 'Archive reminder'}
            </Button>
          </form>
        </div>
      ) : null}
    </dialog>
  );
}
