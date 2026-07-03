'use client';

import { useActionState, useEffect, useRef } from 'react';
import { deleteContactAction } from '@verocrest/domain-contacts/actions';
import { Button } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';

/** Delete confirmation per docs/07 §6.6 — native <dialog> for focus trap + Escape. */
export function DeleteContactDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(deleteContactAction, null);

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
            <h2 className="text-base font-semibold text-fg-strong">Delete this contact?</h2>
            <p className="mt-1 text-sm text-fg-muted">
              <span className="font-medium text-fg">{target.name}</span> will be archived. Their
              history is preserved and they can be restored later.
            </p>
          </div>

          {state?.error ? <FormError message={state.error.message} /> : null}

          <form action={formAction} className="flex items-center justify-end gap-2">
            <input type="hidden" name="contactId" value={target.id} />
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" disabled={pending}>
              {pending ? 'Deleting…' : 'Delete contact'}
            </Button>
          </form>
        </div>
      ) : null}
    </dialog>
  );
}
