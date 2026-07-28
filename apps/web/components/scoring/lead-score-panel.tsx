'use client';

import { useActionState } from 'react';
import { scoreLeadAction } from '@verocrest/domain-scoring/actions';
import type { LeadScore } from '@verocrest/domain-scoring';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';
import type { BadgeProps } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';

/**
 * Lead scoring panel (Sprint 4.9). Runs the deterministic fit + ICP-match engine
 * via the Server Action and shows the explainable result. Readiness/opportunity
 * render as "Not yet available" — they are genuinely absent until Relationship
 * Intelligence ships (Amendment 011), never a fabricated number.
 */

function scoreVariant(score: number): BadgeProps['variant'] {
  return score >= 70 ? 'success' : score >= 40 ? 'warning' : 'danger';
}

function directionVariant(direction: string): BadgeProps['variant'] {
  return direction === 'positive' ? 'success' : direction === 'negative' ? 'danger' : 'neutral';
}

function ScoreStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-xs text-fg-muted">{label}</p>
      {value === null ? (
        <p className="mt-0.5 text-sm text-fg-subtle">Not yet available</p>
      ) : (
        <p className="mt-0.5 font-mono text-lg text-fg-strong">{value}</p>
      )}
    </div>
  );
}

export function LeadScorePanel({ leadId, initial }: { leadId: string; initial: LeadScore | null }) {
  const [state, formAction, pending] = useActionState(scoreLeadAction, null);
  const score = state?.data?.score ?? initial;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm">Lead score</CardTitle>
        <form action={formAction}>
          <input type="hidden" name="leadId" value={leadId} />
          <Button type="submit" disabled={pending}>
            {pending ? 'Scoring…' : score ? 'Re-score' : 'Score lead'}
          </Button>
        </form>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {state?.error ? <FormError message={state.error.message} /> : null}

        {!score ? (
          <p className="text-sm text-fg-muted">
            Score this lead on ICP match + website intelligence. Readiness and opportunity arrive
            with Relationship Intelligence.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-fg-muted">Fit</p>
                <p className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="font-mono text-2xl text-fg-strong">{score.fitScore}</span>
                  <Badge variant={scoreVariant(score.fitScore)}>/100</Badge>
                </p>
              </div>
              <ScoreStat label="Readiness" value={score.readinessScore} />
              <ScoreStat label="Opportunity" value={score.opportunityScore} />
            </div>

            {score.icpMatchScore !== null ? (
              <div className="flex items-center gap-2">
                <Badge variant={scoreVariant(score.icpMatchScore)}>
                  ICP match {score.icpMatchScore}
                </Badge>
                <span className="text-xs text-fg-subtle">
                  algorithm v{score.scoreVersion} · {score.model}
                </span>
              </div>
            ) : (
              <span className="text-xs text-fg-subtle">
                No active ICP (pre-ICP fallback) · algorithm v{score.scoreVersion}
              </span>
            )}

            {score.explainability?.narrative ? (
              <p className="text-sm text-fg">{score.explainability.narrative}</p>
            ) : null}

            {score.topSignals.length > 0 ? (
              <dl className="flex flex-col gap-2 border-t border-edge-subtle pt-3">
                {score.topSignals.map((s, i) => (
                  <div key={`${s.label}-${i}`} className="flex items-start gap-2">
                    <Badge variant={directionVariant(s.direction)}>{s.label}</Badge>
                    <dd className="text-xs text-fg-muted">{s.detail}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
