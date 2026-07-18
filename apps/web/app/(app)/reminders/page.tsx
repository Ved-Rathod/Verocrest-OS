import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import {
  RemindersUnavailableError,
  getRemindersPage,
  type RemindersUnavailableReason,
} from '@verocrest/domain-reminders/server';
import { Button } from '@verocrest/ui-kit';
import { ArchivedNotice } from '@/components/reminders/archived-notice';
import { RemindersTable } from '@/components/reminders/reminders-table';

export const metadata: Metadata = { title: 'Reminders' };
export const dynamic = 'force-dynamic';

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const status = typeof sp.status === 'string' ? sp.status : '';
  const entityType = typeof sp.entityType === 'string' ? sp.entityType : '';

  let unavailable: RemindersUnavailableReason | null = null;
  let items: Awaited<ReturnType<typeof getRemindersPage>>['items'] = [];
  let nextCursor: string | null = null;

  try {
    const page = await getRemindersPage({
      status: (status || undefined) as never,
      entityType: (entityType || undefined) as never,
    });
    items = page.items;
    nextCursor = page.nextCursor;
  } catch (error) {
    if (error instanceof RemindersUnavailableError) unavailable = error.reason;
    else throw error;
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 lg:p-6">
      <ArchivedNotice />
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg-strong">Reminders</h1>
          <p className="text-sm text-fg-muted">Follow-ups so nothing slips.</p>
        </div>
        {!unavailable ? (
          <Link href="/reminders/new">
            <Button>
              <PlusIcon className="size-4" strokeWidth={2} />
              New reminder
            </Button>
          </Link>
        ) : null}
      </div>

      {unavailable ? (
        <UnavailablePanel reason={unavailable} />
      ) : (
        <RemindersTable
          key={`${status}|${entityType}`}
          initialItems={items}
          initialCursor={nextCursor}
          status={status}
          entityType={entityType}
        />
      )}
    </div>
  );
}

function UnavailablePanel({ reason }: { reason: RemindersUnavailableReason }) {
  if (reason === 'setup') {
    return (
      <div className="rounded-md border border-warning-surface bg-warning-surface/40 p-4 text-sm">
        <p className="font-medium text-fg-strong">Reminders table not created yet</p>
        <p className="mt-1 text-fg-muted">
          Apply the migration{' '}
          <code className="font-mono text-xs">
            supabase/migrations/20260703160000_reminders.sql
          </code>{' '}
          in the Supabase SQL editor, then reload.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-edge bg-surface p-4 text-sm">
      <p className="font-medium text-fg-strong">Can’t load reminders</p>
      <p className="mt-1 text-fg-muted">
        Your workspace context couldn’t be resolved. Try reloading or signing in again.
      </p>
    </div>
  );
}
