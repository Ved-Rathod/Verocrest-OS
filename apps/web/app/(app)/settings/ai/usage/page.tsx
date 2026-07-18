import type { Metadata } from 'next';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { getAiUsageOverview } from '@/components/settings/ai/usage-read';
import { UsageSummary } from '@/components/settings/ai/usage-summary';
import { UsageBreakdown } from '@/components/settings/ai/usage-breakdown';
import { UsageTrend } from '@/components/settings/ai/usage-trend';

export const metadata: Metadata = { title: 'AI Usage' };
export const dynamic = 'force-dynamic';

export default async function AiUsagePage() {
  const ctx = await requireWorkspaceContext();
  const overview = await getAiUsageOverview(ctx);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <SettingsTabs />
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">AI Usage</h1>
        <p className="text-sm text-fg-muted">
          Model spend against your monthly budget. Costs come from every AI call the platform makes
          on your behalf.
        </p>
      </div>

      {overview.hasAnyUsage ? (
        <div className="flex flex-col gap-4">
          <UsageSummary overview={overview} />
          <UsageTrend trend={overview.trend} />
          <UsageBreakdown byCapability={overview.byCapability} byModel={overview.byModel} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <UsageSummary overview={overview} />
          <div className="rounded-lg border border-dashed border-edge-subtle p-8 text-center text-sm text-fg-muted">
            No AI usage recorded yet. Spend will appear here as the platform runs AI features.
          </div>
        </div>
      )}
    </div>
  );
}
