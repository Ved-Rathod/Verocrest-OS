import type { Metadata } from 'next';
import Link from 'next/link';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { listTargets, isCurrent } from '@verocrest/domain-revenue/server';
import { TARGET_PERIOD_LABELS } from '@verocrest/domain-revenue';
import { Badge, Button } from '@verocrest/ui-kit';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { formatMoney } from '@/components/revenue/format';

export const metadata: Metadata = { title: 'Revenue Targets' };
export const dynamic = 'force-dynamic';

export default async function RevenueTargetsPage() {
  const ctx = await requireWorkspaceContext();
  const targets = await listTargets(ctx);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <SettingsTabs />
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg-strong">Revenue Targets</h1>
          <p className="text-sm text-fg-muted">
            Set monthly, quarterly, or yearly revenue goals. Live attainment (progress, forecast)
            arrives with Deals in a later sprint.
          </p>
        </div>
        <Link href="/settings/revenue/new">
          <Button>New target</Button>
        </Link>
      </div>

      {targets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-edge-subtle p-8 text-center text-sm text-fg-muted">
          No targets yet. Set your first revenue goal.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {targets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/settings/revenue/${t.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge-subtle bg-surface p-4 hover:border-edge"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg-strong">
                      {formatMoney(t.revenueTarget, t.currency)}
                    </span>
                    <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted">
                      {TARGET_PERIOD_LABELS[t.period]}
                    </span>
                    {isCurrent(t) ? <Badge variant="success">Active</Badge> : null}
                  </div>
                  <p className="text-xs text-fg-subtle">
                    {t.periodStart} → {t.periodEnd}
                  </p>
                </div>
                <Badge variant={t.isIndexed ? 'success' : 'warning'}>
                  {t.isIndexed ? 'Indexed' : 'Indexing…'}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
