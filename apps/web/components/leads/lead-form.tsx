'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { createLeadAction, updateLeadAction } from '@verocrest/domain-leads/actions';
import {
  LEAD_CURRENCIES,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  LEAD_STATUS_LABELS,
  MANUAL_LEAD_STATUSES,
  leadContactName,
  type LeadDetail,
  type LeadStatus,
} from '@verocrest/domain-leads';
import { Button, InputField, TextareaField, cn } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';
import { ContactPicker, type SelectedContact } from './contact-picker';

type Props = { mode: 'create' } | { mode: 'edit'; leadId: string; initial: LeadDetail };

const selectClasses = cn(
  'h-9 rounded-sm border border-edge bg-surface-2 px-3 text-sm text-fg',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
);

export function LeadForm(props: Props) {
  const router = useRouter();
  const action = props.mode === 'create' ? createLeadAction : updateLeadAction;
  const [state, formAction, pending] = useActionState(action, null);
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const fieldErrors = state?.error?.fieldErrors;

  const [status, setStatus] = useState<LeadStatus>(initial?.status ?? 'new');

  const initialContact: SelectedContact | null = initial
    ? {
        id: initial.contact.id,
        name: leadContactName(initial.contact),
        email: initial.contact.primaryEmail,
        companyName: initial.company?.name ?? initial.contact.companyName,
      }
    : null;

  // The form OWNS the selected contact (Sprint 2.3 bugfix): the id is rendered
  // as an uncontrolled, keyed hidden field below so it is always present in the
  // submitted FormData and survives React 19's form-reset-on-action.
  const [contact, setContact] = useState<SelectedContact | null>(initialContact);

  useEffect(() => {
    if (state?.data?.lead) {
      router.push(`/leads/${state.data.lead.id}`);
      router.refresh();
    }
  }, [state, router]);

  // Statuses offered: manual set, plus the current value if it's system-set
  // (so editing a LIE-scored lead later doesn't force a status change).
  const statusOptions: LeadStatus[] = initial
    ? Array.from(new Set<LeadStatus>([initial.status, ...MANUAL_LEAD_STATUSES]))
    : [...MANUAL_LEAD_STATUSES];

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {props.mode === 'edit' ? <input type="hidden" name="leadId" value={props.leadId} /> : null}

      {state?.error && !fieldErrors ? <FormError message={state.error.message} /> : null}

      {/* Uncontrolled + keyed: remounts to the selected id on change, so the
          value is always in the submitted FormData and survives form reset. */}
      <input
        type="hidden"
        name="contactId"
        key={contact?.id ?? 'none'}
        defaultValue={contact?.id ?? ''}
      />
      <ContactPicker value={contact} onChange={setContact} error={fieldErrors?.['contactId']} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lead-status" className="text-sm font-medium text-fg">
            Status
          </label>
          <select
            id="lead-status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as LeadStatus)}
            className={selectClasses}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {fieldErrors?.['status'] ? (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors['status']}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="lead-priority" className="text-sm font-medium text-fg">
            Priority
          </label>
          <select
            id="lead-priority"
            name="priority"
            defaultValue={initial?.priority ?? ''}
            className={selectClasses}
          >
            <option value="">—</option>
            {LEAD_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {LEAD_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === 'disqualified' ? (
        <InputField
          label="Disqualified reason"
          name="disqualifiedReason"
          defaultValue={initial?.disqualifiedReason ?? ''}
          error={fieldErrors?.['disqualifiedReason']}
          help="Why this lead is out."
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InputField
          label="Estimated value"
          name="estimatedValue"
          type="number"
          min={0}
          step="0.01"
          placeholder="5000"
          defaultValue={initial?.estimatedValue ?? ''}
          error={fieldErrors?.['estimatedValue']}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lead-currency" className="text-sm font-medium text-fg">
            Currency
          </label>
          <select
            id="lead-currency"
            name="currency"
            defaultValue={initial?.currency ?? ''}
            className={selectClasses}
          >
            <option value="">—</option>
            {LEAD_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {fieldErrors?.['currency'] ? (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors['currency']}
            </p>
          ) : null}
        </div>
        <InputField
          label="Expected close date"
          name="expectedCloseDate"
          type="date"
          defaultValue={initial?.expectedCloseDate ?? ''}
          error={fieldErrors?.['expectedCloseDate']}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Source"
          name="source"
          placeholder="referral, cold-list, website"
          defaultValue={initial?.source ?? ''}
          error={fieldErrors?.['source']}
        />
        <InputField
          label="Tags"
          name="tags"
          placeholder="dental, au"
          defaultValue={initial?.tags.join(', ') ?? ''}
          help="Comma-separated."
        />
      </div>

      <TextareaField
        label="Notes"
        name="notes"
        rows={3}
        defaultValue={initial?.notes ?? ''}
        error={fieldErrors?.['notes']}
      />

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          type="button"
          onClick={() => router.push(props.mode === 'edit' ? `/leads/${props.leadId}` : '/leads')}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? props.mode === 'create'
              ? 'Creating…'
              : 'Saving…'
            : props.mode === 'create'
              ? 'Create lead'
              : 'Save changes'}
        </Button>
      </div>

      <p className="text-xs text-fg-subtle">
        <Link href="/leads" className="hover:text-fg">
          ← Back to leads
        </Link>
      </p>
    </form>
  );
}
