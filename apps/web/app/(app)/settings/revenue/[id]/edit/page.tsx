import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getTarget } from '@verocrest/domain-revenue/server';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { TargetForm } from '@/components/revenue/target-form';

export const metadata: Metadata = { title: 'Edit Revenue Target' };
export const dynamic = 'force-dynamic';

export default async function EditRevenueTargetPage({
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
      <h1 className="mb-4 text-xl font-semibold text-fg-strong">Edit revenue target</h1>
      <TargetForm mode="edit" target={target} />
    </div>
  );
}
