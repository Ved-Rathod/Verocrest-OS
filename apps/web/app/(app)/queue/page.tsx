import type { Metadata } from 'next';
import { listQueue } from '@verocrest/domain-outreach-queue/server';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { QueueList } from '@/components/queue/queue-list';

export const metadata: Metadata = { title: 'Outreach Queue' };
export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const ctx = await requireWorkspaceContext();
  const items = await listQueue(ctx, 50);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-fg-strong">Outreach Queue</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Leads ranked by opportunity (fit until Relationship Intelligence ships), each with a
          recommended next action and offer. Complete or snooze to apply a cooldown and set a
          follow-up reminder.
        </p>
      </div>
      <QueueList items={items} />
    </div>
  );
}
