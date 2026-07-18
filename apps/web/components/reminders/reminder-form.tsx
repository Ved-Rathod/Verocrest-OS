'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { createReminderAction, updateReminderAction } from '@verocrest/domain-reminders/actions';
import { REMINDER_ENTITY_LABELS, type Reminder } from '@verocrest/domain-reminders';
import { Button, TextareaField, cn } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';
import { EntityPicker, type SelectedEntity } from './entity-picker';

type Props = { mode: 'create' } | { mode: 'edit'; reminderId: string; initial: Reminder };

const inputClasses = cn(
  'h-9 rounded-sm border border-edge bg-surface-2 px-3 text-sm text-fg',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
);

function toDatetimeLocalUTC(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReminderForm(props: Props) {
  const router = useRouter();
  const action = props.mode === 'create' ? createReminderAction : updateReminderAction;
  const [state, formAction, pending] = useActionState(action, null);
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const fieldErrors = state?.error?.fieldErrors;

  // The form OWNS the selected entity (create only); the id is rendered as an
  // uncontrolled, keyed hidden field so it survives React 19's form reset.
  const [entity, setEntity] = useState<SelectedEntity | null>(null);

  // dueAt: controlled. Start with the deterministic UTC value (SSR-safe), then
  // upgrade to the viewer's local timezone after mount.
  const [dueAt, setDueAt] = useState(initial ? toDatetimeLocalUTC(initial.dueAt) : '');
  useEffect(() => {
    if (initial) setDueAt(toDatetimeLocal(initial.dueAt));
  }, [initial]);

  useEffect(() => {
    if (state?.data?.reminder) {
      router.push(`/reminders/${state.data.reminder.id}`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {props.mode === 'edit' ? (
        <input type="hidden" name="reminderId" value={props.reminderId} />
      ) : null}

      {state?.error && !fieldErrors ? <FormError message={state.error.message} /> : null}

      {props.mode === 'create' ? (
        <>
          {/* Keys MUST be unique among siblings: with a shared fallback key
              ('none'/'none') React's keyed reconciliation corrupts and the
              entityType input never remounts with its new defaultValue —
              submitting entityType='' while entityId is correct (Sprint 2.4
              bugfix; React logs "Encountered two children with the same key").
              Distinct prefixes guarantee both remount on every selection change. */}
          <input
            type="hidden"
            name="entityType"
            key={`etype-${entity ? `${entity.type}-${entity.id}` : 'none'}`}
            defaultValue={entity?.type ?? ''}
          />
          <input
            type="hidden"
            name="entityId"
            key={`eid-${entity?.id ?? 'none'}`}
            defaultValue={entity?.id ?? ''}
          />
          {/* Surface EITHER field error — an entityType-only failure was
              previously displayed nowhere (silent rejection). */}
          <EntityPicker
            value={entity}
            onChange={setEntity}
            error={fieldErrors?.['entityId'] ?? fieldErrors?.['entityType']}
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">About</span>
          <div className="flex items-center gap-2 rounded-sm border border-edge bg-surface-2 px-3 py-1.5 text-sm">
            <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted">
              {initial ? REMINDER_ENTITY_LABELS[initial.entityType] : ''}
            </span>
            <span className="truncate text-fg">{initial?.entity?.label ?? '—'}</span>
          </div>
          <p className="text-xs text-fg-subtle">The linked item can’t be changed after creation.</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reminder-due" className="text-sm font-medium text-fg">
          Due <span aria-hidden="true">*</span>
        </label>
        <input
          id="reminder-due"
          type="datetime-local"
          name="dueAt"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className={inputClasses}
        />
        {fieldErrors?.['dueAt'] ? (
          <p role="alert" className="text-xs text-danger">
            {fieldErrors['dueAt']}
          </p>
        ) : null}
      </div>

      <TextareaField
        label="Note"
        name="note"
        rows={3}
        placeholder="What’s the follow-up?"
        defaultValue={initial?.note ?? ''}
        error={fieldErrors?.['note']}
      />

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          type="button"
          onClick={() =>
            router.push(props.mode === 'edit' ? `/reminders/${props.reminderId}` : '/reminders')
          }
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create'
              ? 'Creating…'
              : 'Saving…'
            : props.mode === 'create'
              ? 'Create reminder'
              : 'Save changes'}
        </Button>
      </div>

      <p className="text-xs text-fg-subtle">
        <Link href="/reminders" className="hover:text-fg">
          ← Back to reminders
        </Link>
      </p>
    </form>
  );
}
