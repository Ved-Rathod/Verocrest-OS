'use client';

import Link from 'next/link';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';
import type { BadgeProps } from '@verocrest/ui-kit';
import type { OnboardingItem, OnboardingProgress } from '@verocrest/domain-auth';
import { dismissOnboardingAction } from '@verocrest/domain-auth/onboarding/actions';

/**
 * Founder onboarding checklist (docs/05 §3, docs/07 §9). Reuses the existing
 * feature pages via deep links — no forms are duplicated here. Completion is
 * derived server-side; this only renders. `justCompleted` shows the quiet
 * celebration (docs/07 §9.5 — subtle scale + check, no confetti).
 */

const STATUS: Record<OnboardingItem['status'], { label: string; variant: BadgeProps['variant'] }> =
  {
    done: { label: 'Done', variant: 'success' },
    not_started: { label: 'Not started', variant: 'neutral' },
    coming_soon: { label: 'Coming soon', variant: 'info' },
  };

export function OnboardingChecklist({
  progress,
  justCompleted = false,
}: {
  progress: OnboardingProgress;
  justCompleted?: boolean;
}) {
  const pct = Math.round((progress.requiredDone / progress.requiredTotal) * 100);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <style>{`@keyframes vc-onboard-pop{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}`}</style>

      {progress.complete ? (
        <Card>
          <CardBody
            className="flex flex-col items-center gap-2 py-8 text-center"
            style={justCompleted ? { animation: 'vc-onboard-pop 320ms ease-out' } : undefined}
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full bg-success-surface text-success"
              aria-hidden="true"
            >
              ✓
            </span>
            <p className="text-lg font-semibold text-fg-strong">Setup complete</p>
            <p className="text-sm text-fg-muted">
              Your workspace is ready. Dashboard widgets will fill in as data flows.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-fg-strong">Finish setting up</h1>
            <span className="text-sm text-fg-subtle">
              {progress.requiredDone} of {progress.requiredTotal} done
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {progress.items.map((item) => (
          <li key={item.key}>
            <Card>
              <CardBody className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg-strong">{item.title}</span>
                    <Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge>
                  </div>
                  <p className="text-sm text-fg-muted">{item.description}</p>
                </div>
                {item.status === 'not_started' && item.href ? (
                  <Link href={item.href} className="shrink-0">
                    <Button variant="secondary">{item.cta}</Button>
                  </Link>
                ) : null}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      {!progress.complete ? (
        <div className="flex justify-end">
          <form action={dismissOnboardingAction}>
            <Button type="submit" variant="secondary">
              Dismiss setup
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
