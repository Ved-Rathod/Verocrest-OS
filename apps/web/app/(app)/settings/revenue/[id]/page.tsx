import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getTarget, isCurrent } from '@verocrest/domain-revenue/server';
import { TARGET_PERIOD_LABELS } from '@verocrest/domain-revenue';
import { deleteTargetAction } from '@verocrest/domain-revenue/actions';
import { Badge, Button, Card, CardBody } from '@verocrest/ui-kit';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { formatMoney } from '@/components/revenue/format';

export const metadata: Metadata = { title: 'Revenue Target' };
export const dynamic = 'force-dynamic';

export default async function RevenueTargetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireWorkspaceContext();
  const target = await getTarget(ctx, id);
  if (!target) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <SettingsTabs />
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-fg-strong">
              {formatMoney(target.revenueTarget, target.currency)}
            </h1>
            <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted">
              {TARGET_PERIOD_LABELS[target.period]}
            </span>
            {isCurrent(target) ? <Badge variant="success">Active</Badge> : null}
          </div>
          <p className="text-sm text-fg-muted">
            {target.periodStart} → {target.periodEnd}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/settings/revenue/${target.id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <form action={deleteTargetAction}>
            <input type="hidden" name="id" value={target.id} />
            <Button type="submit" variant="danger">
              Delete
            </Button>
          </form>
        </div>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Field label="Meetings target" value={target.meetingsTarget?.toString() ?? '—'} />
          <Field
            label="Reply-rate target"
            value={target.replyRateTarget != null ? `${target.replyRateTarget}%` : '—'}
          />
          <div className="sm:col-span-2 border-t border-edge-subtle pt-3 text-xs text-fg-subtle">
            Progress, remaining revenue, and forecast will populate once revenue data exists (Deals
            — a later sprint).
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}
