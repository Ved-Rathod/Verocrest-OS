'use client';

import { useActionState, useEffect, useRef } from 'react';
import { deleteLeadAction } from '@verocrest/domain-leads/actions';
import { Button } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';

/**
 * Archive confirmation per docs/07 §6.6 — names the consequence.
 * `redirectTo` (detail context only): the ACTION navigates server-side via
 * redirect(..., replace) on success — a client-side replace can never win
 * because revalidatePath re-renders the deleted detail route into a 404 in the
 * same action response (Sprint 2.4 QA fix, mirrors ArchiveReminderDialog).
 * The list context omits it and stays in place (onDeleted removes the row).
 */
export function DeleteLeadDialog({
  target,
  onClose,
  onDeleted,
  redirectTo,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
  redirectTo?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(deleteLeadAction, null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
  }, [target]);

  useEffect(() => {
    if (state?.data?.deleted && target) onDeleted(target.id);
  }, [state, target, onDeleted]);

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
            <h2 className="text-base font-semibold text-fg-strong">Archive this lead?</h2>
            <p className="mt-1 text-sm text-fg-muted">
              The lead for <span className="font-medium text-fg">{target.name}</span> will be
              archived. The contact is kept; a new lead can be created for them later.
            </p>
          </div>

          {state?.error ? <FormError message={state.error.message} /> : null}

          <form action={formAction} className="flex items-center justify-end gap-2">
            <input type="hidden" name="leadId" value={target.id} />
            {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" disabled={pending}>
              {pending ? 'Archiving…' : 'Archive lead'}
            </Button>
          </form>
        </div>
      ) : null}
    </dialog>
  );
}
