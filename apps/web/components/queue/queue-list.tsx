'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { recalculateQueueItemAction } from '@verocrest/domain-outreach-queue/actions';
import { NEXT_BEST_ACTION_LABELS, type QueueItem } from '@verocrest/domain-outreach-queue';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';
import type { BadgeProps } from '@verocrest/ui-kit';
import { snoozeQueueItemAction, completeQueueItemAction } from '@/app/(app)/queue/actions';

function scoreVariant(score: number): BadgeProps['variant'] {
  return score >= 70 ? 'success' : score >= 40 ? 'warning' : 'danger';
}

function QueueRow({ item }: { item: QueueItem }) {
  const [, recalc, recalcPending] = useActionState(recalculateQueueItemAction, null);
  const [, snooze, snoozePending] = useActionState(snoozeQueueItemAction, null);
  const [, complete, completePending] = useActionState(completeQueueItemAction, null);
  const r = item.reasoning;

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 font-mono text-sm text-fg-subtle">#{item.priorityRank}</span>
            <div className="min-w-0">
              <Link
                href={`/leads/${item.leadId}`}
                className="font-medium text-fg hover:text-primary"
              >
                {item.contactName}
              </Link>
              {item.companyName ? (
                <p className="text-xs text-fg-muted">{item.companyName}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="neutral">{NEXT_BEST_ACTION_LABELS[item.nextBestAction]}</Badge>
            {r?.priority ? (
              <Badge variant={scoreVariant(r.priority.value)}>
                {r.priority.basis === 'opportunity' ? 'Opp' : 'Fit'} {r.priority.value}
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Explainability (D10) */}
        <div className="flex flex-col gap-1 border-l-2 border-edge-subtle pl-3 text-xs text-fg-muted">
          {r?.priority?.note ? <p>{r.priority.note}</p> : null}
          {r?.nextBestAction?.reason ? <p>{r.nextBestAction.reason}</p> : null}
          {r?.recommendedOffer ? (
            <p>
              <span className="font-medium text-fg">Offer — {r.recommendedOffer.offerName}:</span>{' '}
              {r.recommendedOffer.rationale}
              {r.recommendedOffer.aiAvailable
                ? ` (confidence ${r.recommendedOffer.confidence})`
                : ''}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={complete}>
            <input type="hidden" name="leadId" value={item.leadId} />
            <Button type="submit" disabled={completePending} variant="primary">
              {completePending ? 'Completing…' : 'Complete'}
            </Button>
          </form>
          <form action={snooze}>
            <input type="hidden" name="leadId" value={item.leadId} />
            <input type="hidden" name="days" value="3" />
            <Button type="submit" disabled={snoozePending} variant="secondary">
              {snoozePending ? 'Snoozing…' : 'Snooze 3d'}
            </Button>
          </form>
          <form action={recalc}>
            <input type="hidden" name="leadId" value={item.leadId} />
            <Button type="submit" disabled={recalcPending} variant="ghost">
              {recalcPending ? 'Recalculating…' : 'Recalculate'}
            </Button>
          </form>
        </div>
      </CardBody>
    </Card>
  );
}

export function QueueList({ items }: { items: QueueItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-fg-muted">
            The queue is empty. Score a lead (or wait for scoring to run) and it will appear here,
            ranked by opportunity — or fit until Relationship Intelligence ships.
          </p>
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <QueueRow key={item.leadId} item={item} />
      ))}
    </div>
  );
}
