'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { createContactAction, updateContactAction } from '@verocrest/domain-contacts/actions';
import { SENIORITY_LABELS, SENIORITY_LEVELS, type ContactDetail } from '@verocrest/domain-contacts';
import { Button, InputField, TextareaField, cn } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';
import { CompanyPicker } from './company-picker';

type Props = { mode: 'create' } | { mode: 'edit'; contactId: string; initial: ContactDetail };

export function ContactForm(props: Props) {
  const router = useRouter();
  const action = props.mode === 'create' ? createContactAction : updateContactAction;
  const [state, formAction, pending] = useActionState(action, null);
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const fieldErrors = state?.error?.fieldErrors;

  useEffect(() => {
    if (state?.data?.contact) {
      router.push(`/contacts/${state.data.contact.id}`);
      router.refresh();
    }
  }, [state, router]);

  const initialCompany =
    initial?.company != null
      ? { id: initial.company.id, name: initial.company.name }
      : initial?.companyId && initial?.companyName
        ? { id: initial.companyId, name: initial.companyName }
        : null;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {props.mode === 'edit' ? (
        <input type="hidden" name="contactId" value={props.contactId} />
      ) : null}

      {state?.error && !fieldErrors ? <FormError message={state.error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="First name"
          name="firstName"
          defaultValue={initial?.firstName ?? ''}
          error={fieldErrors?.['firstName']}
          autoFocus
        />
        <InputField
          label="Last name"
          name="lastName"
          defaultValue={initial?.lastName ?? ''}
          error={fieldErrors?.['lastName']}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Email"
          name="primaryEmail"
          type="email"
          placeholder="sarah@clinic.com"
          defaultValue={initial?.primaryEmail ?? ''}
          error={fieldErrors?.['primaryEmail']}
        />
        <InputField
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={initial?.phones[0]?.number ?? ''}
          error={fieldErrors?.['phone']}
        />
      </div>

      <CompanyPicker initial={initialCompany} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Role / title"
          name="roleTitle"
          placeholder="Practice manager"
          defaultValue={initial?.roleTitle ?? ''}
          error={fieldErrors?.['roleTitle']}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seniority" className="text-sm font-medium text-fg">
            Seniority
          </label>
          <select
            id="seniority"
            name="seniority"
            defaultValue={initial?.seniority ?? ''}
            className={cn(
              'h-9 rounded-sm border border-edge bg-surface-2 px-3 text-sm text-fg',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            <option value="">—</option>
            {SENIORITY_LEVELS.map((s) => (
              <option key={s} value={s}>
                {SENIORITY_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Website URL"
          name="websiteUrl"
          type="url"
          defaultValue={initial?.websiteUrl ?? ''}
          error={fieldErrors?.['websiteUrl']}
        />
        <InputField
          label="LinkedIn URL"
          name="linkedinUrl"
          type="url"
          defaultValue={initial?.linkedinUrl ?? ''}
          error={fieldErrors?.['linkedinUrl']}
        />
      </div>

      <InputField
        label="Tags"
        name="tags"
        placeholder="decision-maker, warm"
        defaultValue={initial?.tags.join(', ') ?? ''}
        help="Comma-separated."
      />

      <TextareaField
        label="Notes"
        name="notes"
        rows={3}
        defaultValue={initial?.notes ?? ''}
        error={fieldErrors?.['notes']}
      />

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            name="isDecisionMaker"
            defaultChecked={initial?.isDecisionMaker ?? false}
            className="size-4 rounded-sm border-edge accent-[var(--vc-primary)]"
          />
          Decision maker
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            name="isClient"
            defaultChecked={initial?.isClient ?? false}
            className="size-4 rounded-sm border-edge accent-[var(--vc-primary)]"
          />
          This contact is a client
        </label>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          type="button"
          onClick={() =>
            router.push(props.mode === 'edit' ? `/contacts/${props.contactId}` : '/contacts')
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
              ? 'Create contact'
              : 'Save changes'}
        </Button>
      </div>

      <p className="text-xs text-fg-subtle">
        <Link href="/contacts" className="hover:text-fg">
          ← Back to contacts
        </Link>
      </p>
    </form>
  );
}
