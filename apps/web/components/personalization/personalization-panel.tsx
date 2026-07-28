'use client';

import { useActionState } from 'react';
import { generatePersonalizationAction } from '@verocrest/domain-personalization/actions';
import { type Personalization } from '@verocrest/domain-personalization';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';
import type { BadgeProps } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';

/**
 * Reusable AI Personalization panel (Milestone M4, D8). Self-contained: takes a
 * `contactId` + initial history, so it can later be embedded in Leads, Companies,
 * or the Outreach Queue without change. Generates structured personalization via
 * the Server Action, shows the latest components + confidence + citations, and
 * lists history.
 */

const COMPONENT_ORDER: { key: keyof Personalization['components']; label: string }[] = [
  { key: 'opening_line', label: 'Opening line' },
  { key: 'compliment', label: 'Compliment' },
  { key: 'website_observation', label: 'Website observation' },
  { key: 'pain_hypothesis', label: 'Pain hypothesis' },
  { key: 'value_proposition', label: 'Value proposition' },
  { key: 'cta_suggestion', label: 'CTA suggestion' },
];

function confidenceVariant(confidence: number): BadgeProps['variant'] {
  return confidence >= 70 ? 'success' : confidence >= 40 ? 'warning' : 'danger';
}

export function PersonalizationPanel({
  contactId,
  initial,
}: {
  contactId: string;
  initial: Personalization[];
}) {
  const [state, formAction, pending] = useActionState(generatePersonalizationAction, null);
  const generated = state?.data?.personalization ?? null;
  const history = generated ? [generated, ...initial] : initial;
  const latest = history[0] ?? null;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm">AI Personalization</CardTitle>
        <form action={formAction}>
          <input type="hidden" name="contactId" value={contactId} />
          <Button type="submit" disabled={pending}>
            {pending ? 'Generating…' : latest ? 'Regenerate' : 'Generate'}
          </Button>
        </form>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {state?.error ? <FormError message={state.error.message} /> : null}

        {!latest ? (
          <p className="text-sm text-fg-muted">
            Generate structured, grounded personalization from this contact’s company, your ICP and
            offers, the latest website analysis, and AI Memory.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={confidenceVariant(latest.components.confidence)}>
                Confidence {latest.components.confidence}
              </Badge>
              {latest.citations ? (
                <span className="text-xs text-fg-subtle">
                  {latest.citations.memoryIds.length} memory citation(s)
                  {latest.citations.icpId ? ' · ICP' : ''}
                  {latest.citations.offerIds.length > 0 ? ' · offer' : ''}
                  {latest.citations.auditId ? ' · audit' : ''}
                </span>
              ) : null}
            </div>

            <dl className="flex flex-col gap-3">
              {COMPONENT_ORDER.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                    {label}
                  </dt>
                  <dd className="text-sm text-fg">{String(latest.components[key])}</dd>
                </div>
              ))}
            </dl>

            {history.length > 1 ? (
              <div className="border-t border-edge-subtle pt-3">
                <p className="mb-1 text-xs font-medium text-fg-subtle">History</p>
                <ul className="flex flex-col gap-1 text-xs text-fg-muted">
                  {history.slice(1).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{p.components.opening_line}</span>
                      <span className="shrink-0">
                        {new Date(p.createdAt).toLocaleDateString('en')} · conf{' '}
                        {p.components.confidence}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
