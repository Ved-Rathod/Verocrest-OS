import { Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';
import type { UsageDay } from './usage-read';
import { formatUsd } from './format';

/**
 * 30-day cost trend (docs/09 §6.6). Rendered as inline CSS bars — no charting
 * dependency (D4). Bars scale to the max daily cost in the window.
 */
export function UsageTrend({ trend }: { trend: UsageDay[] }) {
  const max = Math.max(...trend.map((d) => d.costUsd), 0);
  const total = trend.reduce((sum, d) => sum + d.costUsd, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Last 30 days</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {total === 0 ? (
          <p className="text-sm text-fg-muted">No AI spend in the last 30 days.</p>
        ) : (
          <div className="flex h-24 items-end gap-0.5" aria-hidden="true">
            {trend.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${formatUsd(d.costUsd)}`}
                className="flex-1 rounded-t-sm bg-primary/70"
                style={{
                  height: `${max > 0 ? Math.max((d.costUsd / max) * 100, d.costUsd > 0 ? 4 : 0) : 0}%`,
                }}
              />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-fg-subtle">
          <span>{trend[0]?.day}</span>
          <span>30-day total: {formatUsd(total)}</span>
          <span>{trend[trend.length - 1]?.day}</span>
        </div>
      </CardBody>
    </Card>
  );
}
