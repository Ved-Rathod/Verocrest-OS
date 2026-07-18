import { Badge, Card, CardBody } from '@verocrest/ui-kit';
import type { AiUsageOverview } from './usage-read';
import { formatUsd } from './format';

/**
 * Budget gauge for Settings → AI Usage (docs/09 §6.6): calendar month-to-date
 * spend against the workspace monthly budget, with an 80%-of-budget warning.
 */
export function UsageSummary({ overview }: { overview: AiUsageOverview }) {
  const pct = Math.min(overview.fractionUsed, 1) * 100;
  const barColor = overview.overBudget
    ? 'bg-danger'
    : overview.overEightyPct
      ? 'bg-warning'
      : 'bg-primary';

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs text-fg-subtle">Spend this month ({overview.monthLabel})</p>
            <p className="text-2xl font-semibold text-fg-strong">
              {formatUsd(overview.monthToDateUsd)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-fg-subtle">Monthly budget</p>
            <p className="text-sm text-fg-muted">
              {overview.budgetUsd > 0 ? formatUsd(overview.budgetUsd) : 'Not set'}
            </p>
          </div>
        </div>

        {overview.budgetUsd > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-fg-subtle">
              <span>{Math.round(overview.fractionUsed * 100)}% of budget used</span>
              {overview.overBudget ? (
                <Badge variant="danger">Over budget</Badge>
              ) : overview.overEightyPct ? (
                <Badge variant="warning">Over 80% of budget</Badge>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
