import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import {
  LeadsUnavailableError,
  getLeadsPage,
  type LeadsUnavailableReason,
} from '@verocrest/domain-leads/server';
import { Button } from '@verocrest/ui-kit';
import { ArchivedNotice } from '@/components/leads/archived-notice';
import { LeadsTable } from '@/components/leads/leads-table';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const search = typeof sp.q === 'string' ? sp.q : '';
  const status = typeof sp.status === 'string' ? sp.status : '';
  const priority = typeof sp.priority === 'string' ? sp.priority : '';

  let unavailable: LeadsUnavailableReason | null = null;
  let items: Awaited<ReturnType<typeof getLeadsPage>>['items'] = [];
  let nextCursor: string | null = null;

  try {
    const page = await getLeadsPage({
      search: search || undefined,
      status: (status || undefined) as never,
      priority: (priority || undefined) as never,
    });
    items = page.items;
    nextCursor = page.nextCursor;
  } catch (error) {
    if (error instanceof LeadsUnavailableError) unavailable = error.reason;
    else throw error;
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 lg:p-6">
      <ArchivedNotice />
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg-strong">Leads</h1>
          <p className="text-sm text-fg-muted">Contacts you&apos;re actively pursuing.</p>
        </div>
        {!unavailable ? (
          <Link href="/leads/new">
            <Button>
              <PlusIcon className="size-4" strokeWidth={2} />
              New lead
            </Button>
          </Link>
        ) : null}
      </div>

      {unavailable ? (
        <UnavailablePanel reason={unavailable} />
      ) : (
        <LeadsTable
          key={`${search}|${status}|${priority}`}
          initialItems={items}
          initialCursor={nextCursor}
          search={search}
          status={status}
          priority={priority}
        />
      )}
    </div>
  );
}

function UnavailablePanel({ reason }: { reason: LeadsUnavailableReason }) {
  if (reason === 'setup') {
    return (
      <div className="rounded-md border border-warning-surface bg-warning-surface/40 p-4 text-sm">
        <p className="font-medium text-fg-strong">Leads table not created yet</p>
        <p className="mt-1 text-fg-muted">
          Apply the migration{' '}
          <code className="font-mono text-xs">supabase/migrations/20260703150000_leads.sql</code> in
          the Supabase SQL editor, then reload.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-edge bg-surface p-4 text-sm">
      <p className="font-medium text-fg-strong">Can’t load leads</p>
      <p className="mt-1 text-fg-muted">
        Your workspace context couldn’t be resolved. Try reloading or signing in again.
      </p>
    </div>
  );
}
