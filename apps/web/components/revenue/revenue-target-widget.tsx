import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';
import { TARGET_PERIOD_LABELS, type Target } from '@verocrest/domain-revenue';
import { formatMoney } from './format';

/**
 * FR-DASH-006 Revenue Target widget (docs/07 §6.5, docs/06 §7.10). Sprint 4.7
 * populates the *target* half only; attainment/progress/forecast arrive with
 * Deals (Sprint 10, D2), so the progress bar renders a deferred 0% state.
 */
export function RevenueTargetWidget({ targets }: { targets: Target[] }) {
  // Prefer the monthly target for the headline, else the first current target.
  const target = targets.find((t) => t.period === 'monthly') ?? targets[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Revenue Target</CardTitle>
      </CardHeader>
      <CardBody>
        {target ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold text-fg-strong">
                {formatMoney(target.revenueTarget, target.currency)}
              </span>
              <span className="text-xs text-fg-subtle">{TARGET_PERIOD_LABELS[target.period]}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-primary" style={{ width: '0%' }} />
            </div>
            <p className="text-xs text-fg-subtle">
              Attainment (progress, remaining, forecast) activates when revenue data exists — Deals,
              a later sprint.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <p className="text-sm font-medium text-fg">No target set</p>
            <p className="max-w-xs text-xs text-fg-muted">
              Set monthly, quarterly, or yearly goals to track pace.
            </p>
            <Link
              href="/settings/revenue/new"
              className="text-xs font-medium text-primary hover:underline"
            >
              Set a revenue target →
            </Link>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
