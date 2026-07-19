'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createIcpAction, updateIcpAction } from '@verocrest/domain-knowledge/actions';
import { COMPANY_SIZES, type Icp } from '@verocrest/domain-knowledge';
import { Button, InputField, TextareaField } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';
import { unmappedFieldErrors } from '@/components/forms/form-errors';

const INLINE_ERROR_KEYS = [
  'name',
  'shortDescription',
  'narrative',
  'targetIndustries',
  'targetGeographies',
  'targetRevenueMin',
  'targetRevenueMax',
  'targetRevenueCurrency',
  'disqualifiers',
] as const;

const SIZE_LABELS: Record<string, string> = {
  solo: 'Solo',
  micro: 'Micro',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  enterprise: 'Enterprise',
};

type Props = { mode: 'create' } | { mode: 'edit'; icp: Icp };

export function IcpForm(props: Props) {
  const action = props.mode === 'create' ? createIcpAction : updateIcpAction;
  const [state, formAction, pending] = useActionState(action, null);
  const initial = props.mode === 'edit' ? props.icp : undefined;
  const fieldErrors = state?.error?.fieldErrors;
  const bannerErrors = unmappedFieldErrors(fieldErrors, INLINE_ERROR_KEYS);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {props.mode === 'edit' ? <input type="hidden" name="id" value={props.icp.id} /> : null}
      {state?.error && (!fieldErrors || bannerErrors.length > 0) ? (
        <FormError
          message={bannerErrors.length > 0 ? bannerErrors.join(' ') : state.error.message}
        />
      ) : null}

      <InputField
        label="Name"
        name="name"
        defaultValue={initial?.name ?? ''}
        error={fieldErrors?.['name']}
        autoFocus
      />
      <InputField
        label="Short description"
        name="shortDescription"
        defaultValue={initial?.shortDescription ?? ''}
        error={fieldErrors?.['shortDescription']}
      />
      <TextareaField
        label="Narrative"
        name="narrative"
        rows={8}
        defaultValue={initial?.narrative ?? ''}
        error={fieldErrors?.['narrative']}
        help="Long-form description of your ideal customer. This is what feeds AI Memory."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Target industries"
          name="targetIndustries"
          defaultValue={initial?.targetIndustries.join(', ') ?? ''}
          error={fieldErrors?.['targetIndustries']}
          help="Comma-separated"
        />
        <InputField
          label="Target geographies"
          name="targetGeographies"
          defaultValue={initial?.targetGeographies.join(', ') ?? ''}
          error={fieldErrors?.['targetGeographies']}
          help="ISO country codes, comma-separated (e.g. AU, NZ)"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-fg">Target company size</legend>
        <div className="flex flex-wrap gap-3">
          {COMPANY_SIZES.map((size) => (
            <label key={size} className="flex items-center gap-1.5 text-sm text-fg">
              <input
                type="checkbox"
                name="targetSize"
                value={size}
                defaultChecked={initial?.targetSize.includes(size) ?? false}
              />
              {SIZE_LABELS[size]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InputField
          label="Revenue min"
          name="targetRevenueMin"
          type="number"
          defaultValue={initial?.targetRevenueMin?.toString() ?? ''}
          error={fieldErrors?.['targetRevenueMin']}
        />
        <InputField
          label="Revenue max"
          name="targetRevenueMax"
          type="number"
          defaultValue={initial?.targetRevenueMax?.toString() ?? ''}
          error={fieldErrors?.['targetRevenueMax']}
        />
        <InputField
          label="Currency"
          name="targetRevenueCurrency"
          maxLength={3}
          defaultValue={initial?.targetRevenueCurrency ?? ''}
          error={fieldErrors?.['targetRevenueCurrency']}
          help="ISO 4217"
        />
      </div>

      <InputField
        label="Disqualifiers"
        name="disqualifiers"
        defaultValue={initial?.disqualifiers.join(', ') ?? ''}
        error={fieldErrors?.['disqualifiers']}
        help="Comma-separated reasons to exclude a prospect"
      />

      <div className="flex items-center justify-end gap-2">
        <Link href={props.mode === 'edit' ? `/settings/icps/${props.icp.id}` : '/settings/icps'}>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save & Activate'}
        </Button>
      </div>
    </form>
  );
}
