import type { Metadata } from 'next';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { TargetForm } from '@/components/revenue/target-form';

export const metadata: Metadata = { title: 'New Revenue Target' };

export default function NewRevenueTargetPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <SettingsTabs />
      <h1 className="mb-4 text-xl font-semibold text-fg-strong">New revenue target</h1>
      <TargetForm mode="create" />
    </div>
  );
}
