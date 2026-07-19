'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createTargetAction, updateTargetAction } from '@verocrest/domain-revenue/actions';
import { TARGET_PERIODS, TARGET_PERIOD_LABELS, type Target } from '@verocrest/domain-revenue';
import { Button, InputField } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';
import { unmappedFieldErrors } from '@/components/forms/form-errors';

const INLINE_ERROR_KEYS = [
  'period',
  'periodStart',
  'periodEnd',
  'revenueTarget',
  'currency',
  'meetingsTarget',
  'replyRateTarget',
] as const;

const inputCls =
  'h-9 rounded-sm border border-edge bg-surface-2 px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

type Props = { mode: 'create' } | { mode: 'edit'; target: Target };

export function TargetForm(props: Props) {
  const action = props.mode === 'create' ? createTargetAction : updateTargetAction;
  const [state, formAction, pending] = useActionState(action, null);
  const initial = props.mode === 'edit' ? props.target : undefined;
  const fieldErrors = state?.error?.fieldErrors;
  const bannerErrors = unmappedFieldErrors(fieldErrors, INLINE_ERROR_KEYS);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {props.mode === 'edit' ? <input type="hidden" name="id" value={props.target.id} /> : null}
      {state?.error && (!fieldErrors || bannerErrors.length > 0) ? (
        <FormError
          message={bannerErrors.length > 0 ? bannerErrors.join(' ') : state.error.message}
        />
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="period" className="text-sm font-medium text-fg">
          Period
        </label>
        <select
          id="period"
          name="period"
          defaultValue={initial?.period ?? 'monthly'}
          className={inputCls}
        >
          {TARGET_PERIODS.map((p) => (
            <option key={p} value={p}>
              {TARGET_PERIOD_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Start date"
          name="periodStart"
          type="date"
          defaultValue={initial?.periodStart ?? ''}
          error={fieldErrors?.['periodStart']}
        />
        <InputField
          label="End date"
          name="periodEnd"
          type="date"
          defaultValue={initial?.periodEnd ?? ''}
          error={fieldErrors?.['periodEnd']}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Revenue target"
          name="revenueTarget"
          type="number"
          defaultValue={initial ? String(initial.revenueTarget) : ''}
          error={fieldErrors?.['revenueTarget']}
        />
        <InputField
          label="Currency"
          name="currency"
          defaultValue={initial?.currency ?? 'USD'}
          error={fieldErrors?.['currency']}
          help="3-letter ISO code"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Meetings target (optional)"
          name="meetingsTarget"
          type="number"
          defaultValue={initial?.meetingsTarget != null ? String(initial.meetingsTarget) : ''}
          error={fieldErrors?.['meetingsTarget']}
        />
        <InputField
          label="Reply rate target % (optional)"
          name="replyRateTarget"
          type="number"
          defaultValue={initial?.replyRateTarget != null ? String(initial.replyRateTarget) : ''}
          error={fieldErrors?.['replyRateTarget']}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-edge-subtle pt-4">
        <Link
          href={
            props.mode === 'edit' ? `/settings/revenue/${props.target.id}` : '/settings/revenue'
          }
        >
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save target'}
        </Button>
      </div>
    </form>
  );
}
