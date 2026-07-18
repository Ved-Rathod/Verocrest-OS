'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { createCompanyAction, updateCompanyAction } from '@verocrest/domain-contacts/actions';
import {
  COMPANY_SIZES,
  COMPANY_SIZE_LABELS,
  type Company,
  type CustomFieldDefinition,
} from '@verocrest/domain-contacts';
import { Button, InputField, TextareaField, cn } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';
import { CustomFieldsInput } from '@/components/custom-fields/custom-fields-input';

type Props = ({ mode: 'create' } | { mode: 'edit'; companyId: string; initial: Company }) & {
  definitions: CustomFieldDefinition[];
};

export function CompanyForm(props: Props) {
  const router = useRouter();
  const action = props.mode === 'create' ? createCompanyAction : updateCompanyAction;
  const [state, formAction, pending] = useActionState(action, null);
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const fieldErrors = state?.error?.fieldErrors;

  useEffect(() => {
    if (state?.data?.company) {
      router.push('/companies');
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {props.mode === 'edit' ? (
        <input type="hidden" name="companyId" value={props.companyId} />
      ) : null}

      {state?.error && !fieldErrors ? <FormError message={state.error.message} /> : null}

      <InputField
        label="Company name"
        name="name"
        required
        defaultValue={initial?.name}
        error={fieldErrors?.['name']}
        autoFocus
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Domain"
          name="domain"
          placeholder="acme.com"
          defaultValue={initial?.domain ?? ''}
          help="Used to prevent duplicate companies."
          error={fieldErrors?.['domain']}
        />
        <InputField
          label="Website URL"
          name="websiteUrl"
          type="url"
          placeholder="https://acme.com"
          defaultValue={initial?.websiteUrl ?? ''}
          error={fieldErrors?.['websiteUrl']}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Industry"
          name="industry"
          placeholder="Dental"
          defaultValue={initial?.industry ?? ''}
          error={fieldErrors?.['industry']}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="size" className="text-sm font-medium text-fg">
            Size
          </label>
          <select
            id="size"
            name="size"
            defaultValue={initial?.size ?? ''}
            className={cn(
              'h-9 rounded-sm border border-edge bg-surface-2 px-3 text-sm text-fg',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            <option value="">—</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {COMPANY_SIZE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Employee count"
          name="employeeCount"
          type="number"
          min={0}
          placeholder="12"
          defaultValue={initial?.employeeCount ?? ''}
          error={fieldErrors?.['employeeCount']}
        />
        <InputField
          label="Tags"
          name="tags"
          placeholder="dental, vip"
          defaultValue={initial?.tags.join(', ') ?? ''}
          help="Comma-separated."
        />
      </div>

      <TextareaField
        label="Description"
        name="description"
        rows={3}
        defaultValue={initial?.description ?? ''}
        error={fieldErrors?.['description']}
      />

      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          name="isClient"
          defaultChecked={initial?.isClient ?? false}
          className="size-4 rounded-sm border-edge accent-[var(--vc-primary)]"
        />
        This company is a client
      </label>

      <CustomFieldsInput
        definitions={props.definitions}
        initial={initial?.customFields}
        errors={fieldErrors}
      />

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="ghost" type="button" onClick={() => router.push('/companies')}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create'
              ? 'Creating…'
              : 'Saving…'
            : props.mode === 'create'
              ? 'Create company'
              : 'Save changes'}
        </Button>
      </div>

      <p className="text-xs text-fg-subtle">
        <Link href="/companies" className="hover:text-fg">
          ← Back to companies
        </Link>
      </p>
    </form>
  );
}
