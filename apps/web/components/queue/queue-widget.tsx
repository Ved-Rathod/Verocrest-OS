import Link from 'next/link';
import { SparklesIcon } from 'lucide-react';
import { NEXT_BEST_ACTION_LABELS, type QueueItem } from '@verocrest/domain-outreach-queue';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@verocrest/ui-kit';
import type { BadgeProps } from '@verocrest/ui-kit';

/**
 * Today's Gold Leads widget (Sprint 5.0, docs/06 §7.10 FR-DASH-001). The top of
 * the materialized Outreach Queue by priority rank. Full dashboard data/realtime
 * remains Sprint 12; this renders the real queue projection now (like the revenue
 * widget shipped ahead of S12).
 */

function scoreVariant(score: number): BadgeProps['variant'] {
  return score >= 70 ? 'success' : score >= 40 ? 'warning' : 'danger';
}

export function QueueWidget({ items }: { items: QueueItem[] }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="text-sm">Today&apos;s Gold Leads</CardTitle>
        <Link href="/queue" className="text-xs text-fg-muted hover:text-primary">
          View queue →
        </Link>
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <SparklesIcon aria-hidden="true" className="size-8 text-fg-subtle" strokeWidth={1.75} />
            <p className="text-sm font-medium text-fg">No leads queued</p>
            <p className="max-w-xs text-xs text-fg-muted">
              Score a lead and it appears here, ranked by opportunity (fit until Relationship
              Intelligence ships).
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-edge-subtle">
            {items.map((item) => (
              <li
                key={item.leadId}
                className="flex items-center justify-between gap-3 py-2 first:pt-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs text-fg-subtle">#{item.priorityRank}</span>
                  <Link
                    href={`/leads/${item.leadId}`}
                    className="truncate text-sm text-fg hover:text-primary"
                  >
                    {item.contactName}
                    {item.companyName ? (
                      <span className="text-fg-muted"> · {item.companyName}</span>
                    ) : null}
                  </Link>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-fg-subtle">
                    {NEXT_BEST_ACTION_LABELS[item.nextBestAction]}
                  </span>
                  {item.reasoning?.priority ? (
                    <Badge variant={scoreVariant(item.reasoning.priority.value)}>
                      {item.reasoning.priority.value}
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
