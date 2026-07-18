'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { createOfferAction, updateOfferAction } from '@verocrest/domain-knowledge/actions';
import {
  BILLING_CADENCES,
  COMPANY_SIZES,
  PRICING_MODELS,
  type Deliverable,
  type Guarantee,
  type Offer,
  type OnboardingStep,
} from '@verocrest/domain-knowledge';
import { Button, InputField, TextareaField } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';

type IcpOption = { id: string; name: string };
type Props = ({ mode: 'create' } | { mode: 'edit'; offer: Offer }) & { icps: IcpOption[] };

const inputCls =
  'h-9 rounded-sm border border-edge bg-surface-2 px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 border-t border-edge-subtle pt-4 text-sm font-semibold text-fg-strong">
      {children}
    </h2>
  );
}

export function OfferForm(props: Props) {
  const action = props.mode === 'create' ? createOfferAction : updateOfferAction;
  const [state, formAction, pending] = useActionState(action, null);
  const initial = props.mode === 'edit' ? props.offer : undefined;
  const fieldErrors = state?.error?.fieldErrors;

  const [deliverables, setDeliverables] = useState<Deliverable[]>(initial?.deliverables ?? []);
  const [guarantees, setGuarantees] = useState<Guarantee[]>(initial?.guarantees ?? []);
  const [steps, setSteps] = useState<OnboardingStep[]>(initial?.onboardingSteps ?? []);
  const [requirements, setRequirements] = useState<string[]>(initial?.requirements ?? []);
  const [expectedLiftPct, setExpectedLiftPct] = useState(
    initial?.roiMetrics.expectedLiftPct?.toString() ?? '',
  );
  const [paybackMonths, setPaybackMonths] = useState(
    initial?.roiMetrics.paybackMonths?.toString() ?? '',
  );

  const roiMetrics = {
    ...(expectedLiftPct.trim() !== '' && Number.isFinite(Number(expectedLiftPct))
      ? { expectedLiftPct: Number(expectedLiftPct) }
      : {}),
    ...(paybackMonths.trim() !== '' && Number.isFinite(Number(paybackMonths))
      ? { paybackMonths: Number(paybackMonths) }
      : {}),
  };

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {props.mode === 'edit' ? <input type="hidden" name="id" value={props.offer.id} /> : null}
      {/* Structured fields travel as JSON (form manages them client-side). */}
      <input type="hidden" name="deliverables" value={JSON.stringify(deliverables)} />
      <input type="hidden" name="guarantees" value={JSON.stringify(guarantees)} />
      <input type="hidden" name="onboardingSteps" value={JSON.stringify(steps)} />
      <input type="hidden" name="requirements" value={JSON.stringify(requirements)} />
      <input type="hidden" name="roiMetrics" value={JSON.stringify(roiMetrics)} />

      {state?.error && !fieldErrors ? <FormError message={state.error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Name"
          name="name"
          defaultValue={initial?.name ?? ''}
          error={fieldErrors?.['name']}
          autoFocus
        />
        <InputField
          label="Slug"
          name="slug"
          defaultValue={initial?.slug ?? ''}
          error={fieldErrors?.['slug']}
          help="Auto-generated from name if blank"
        />
      </div>
      <InputField
        label="Short description"
        name="shortDescription"
        defaultValue={initial?.shortDescription ?? ''}
        error={fieldErrors?.['shortDescription']}
      />
      <TextareaField
        label="Positioning"
        name="positioning"
        rows={4}
        defaultValue={initial?.positioning ?? ''}
        error={fieldErrors?.['positioning']}
        help="Brand-facing narrative. Feeds AI Memory."
      />

      <SectionTitle>Targeting</SectionTitle>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="targetIcpId" className="text-sm font-medium text-fg">
          Target ICP
        </label>
        <select
          id="targetIcpId"
          name="targetIcpId"
          defaultValue={initial?.targetIcpId ?? ''}
          className={inputCls}
        >
          <option value="">— None —</option>
          {props.icps.map((icp) => (
            <option key={icp.id} value={icp.id}>
              {icp.name}
            </option>
          ))}
        </select>
      </div>
      <InputField
        label="Target industries"
        name="targetIndustries"
        defaultValue={initial?.targetIndustries.join(', ') ?? ''}
        help="Comma-separated"
        error={fieldErrors?.['targetIndustries']}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-fg">Target company size</legend>
        <div className="flex flex-wrap gap-3">
          {COMPANY_SIZES.map((size) => (
            <label key={size} className="flex items-center gap-1.5 text-sm text-fg">
              <input
                type="checkbox"
                name="targetCompanySize"
                value={size}
                defaultChecked={initial?.targetCompanySize.includes(size) ?? false}
              />
              {size}
            </label>
          ))}
        </div>
      </fieldset>

      <SectionTitle>Pricing</SectionTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pricingModel" className="text-sm font-medium text-fg">
            Pricing model
          </label>
          <select
            id="pricingModel"
            name="pricingModel"
            defaultValue={initial?.pricingModel ?? 'fixed'}
            className={inputCls}
          >
            {PRICING_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="billingCadence" className="text-sm font-medium text-fg">
            Billing cadence
          </label>
          <select
            id="billingCadence"
            name="billingCadence"
            defaultValue={initial?.billingCadence ?? ''}
            className={inputCls}
          >
            <option value="">— None —</option>
            {BILLING_CADENCES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InputField
          label="Price"
          name="price"
          type="number"
          defaultValue={initial?.price?.toString() ?? ''}
          error={fieldErrors?.['price']}
        />
        <InputField
          label="Price max"
          name="priceMax"
          type="number"
          defaultValue={initial?.priceMax?.toString() ?? ''}
          error={fieldErrors?.['priceMax']}
        />
        <InputField
          label="Currency"
          name="currency"
          maxLength={3}
          defaultValue={initial?.currency ?? ''}
          error={fieldErrors?.['currency']}
          help="ISO 4217"
        />
      </div>

      <SectionTitle>Deliverables</SectionTitle>
      <RowEditor
        rows={deliverables}
        onChange={setDeliverables}
        empty={{ title: '' }}
        addLabel="Add deliverable"
        render={(row, update) => (
          <>
            <input
              className={inputCls}
              placeholder="Title"
              value={row.title}
              onChange={(e) => update({ ...row, title: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Description"
              value={row.description ?? ''}
              onChange={(e) => update({ ...row, description: e.target.value })}
            />
          </>
        )}
      />

      <SectionTitle>Guarantees</SectionTitle>
      <RowEditor
        rows={guarantees}
        onChange={setGuarantees}
        empty={{ type: '' }}
        addLabel="Add guarantee"
        render={(row, update) => (
          <>
            <input
              className={inputCls}
              placeholder="Type"
              value={row.type}
              onChange={(e) => update({ ...row, type: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Description"
              value={row.description ?? ''}
              onChange={(e) => update({ ...row, description: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Conditions"
              value={row.conditions ?? ''}
              onChange={(e) => update({ ...row, conditions: e.target.value })}
            />
          </>
        )}
      />

      <SectionTitle>ROI</SectionTitle>
      <TextareaField
        label="ROI narrative"
        name="roiNarrative"
        rows={4}
        defaultValue={initial?.roiNarrative ?? ''}
        error={fieldErrors?.['roiNarrative']}
        help="Long-form ROI story. Feeds AI Memory."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Expected lift %"
          type="number"
          value={expectedLiftPct}
          onChange={(e) => setExpectedLiftPct(e.target.value)}
        />
        <InputField
          label="Payback months"
          type="number"
          value={paybackMonths}
          onChange={(e) => setPaybackMonths(e.target.value)}
        />
      </div>

      <SectionTitle>Onboarding steps</SectionTitle>
      <RowEditor
        rows={steps}
        onChange={setSteps}
        empty={{ order: 0, title: '' }}
        addLabel="Add step"
        render={(row, update) => (
          <>
            <input
              className={inputCls}
              placeholder="Title"
              value={row.title}
              onChange={(e) => update({ ...row, title: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Description"
              value={row.description ?? ''}
              onChange={(e) => update({ ...row, description: e.target.value })}
            />
          </>
        )}
      />

      <SectionTitle>Requirements</SectionTitle>
      <RowEditor
        rows={requirements}
        onChange={setRequirements}
        empty={''}
        addLabel="Add requirement"
        render={(row, update) => (
          <input
            className={inputCls}
            placeholder="What the client must provide"
            value={row}
            onChange={(e) => update(e.target.value)}
          />
        )}
      />

      <div className="mt-2 flex items-center justify-end gap-2 border-t border-edge-subtle pt-4">
        <Link
          href={props.mode === 'edit' ? `/settings/offers/${props.offer.id}` : '/settings/offers'}
        >
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
          Save as Draft
        </Button>
        <Button type="submit" name="intent" value="activate" disabled={pending}>
          {pending ? 'Saving…' : 'Save & Activate'}
        </Button>
      </div>
    </form>
  );
}

/** Generic add/remove row editor for the structured lists. */
function RowEditor<T>({
  rows,
  onChange,
  empty,
  addLabel,
  render,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  empty: T;
  addLabel: string;
  render: (row: T, update: (next: T) => void) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            {render(row, (next) => onChange(rows.map((r, j) => (j === i ? next : r))))}
          </div>
          <button
            type="button"
            aria-label="Remove"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="mt-1 rounded-sm px-2 py-1 text-xs text-fg-muted hover:bg-surface-3 hover:text-danger"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, structuredClone(empty)])}
        className="self-start rounded-sm border border-dashed border-edge px-3 py-1.5 text-xs text-fg-muted hover:border-edge-strong hover:text-fg"
      >
        + {addLabel}
      </button>
    </div>
  );
}
