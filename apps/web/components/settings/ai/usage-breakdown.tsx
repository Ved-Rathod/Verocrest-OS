import { Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';
import type { CostSlice } from './usage-read';
import { formatUsd, formatInt } from './format';

/**
 * Month-to-date spend attribution (docs/09 §6.6). Cost is aggregated from
 * ai_usage_events (the per-call record); the daily rollup only counts calls.
 */
function BreakdownTable({ title, slices }: { title: string; slices: CostSlice[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {slices.length === 0 ? (
          <p className="text-sm text-fg-muted">No spend recorded this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge-subtle text-left text-xs text-fg-subtle">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 text-right font-medium">Calls</th>
                <th className="pb-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((slice) => (
                <tr key={slice.key} className="border-b border-edge-subtle last:border-0">
                  <td className="py-2 font-mono text-xs text-fg">{slice.key}</td>
                  <td className="py-2 text-right text-fg-muted">{formatInt(slice.calls)}</td>
                  <td className="py-2 text-right text-fg-strong">{formatUsd(slice.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

export function UsageBreakdown({
  byCapability,
  byModel,
}: {
  byCapability: CostSlice[];
  byModel: CostSlice[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <BreakdownTable title="By capability" slices={byCapability} />
      <BreakdownTable title="By model" slices={byModel} />
    </div>
  );
}
