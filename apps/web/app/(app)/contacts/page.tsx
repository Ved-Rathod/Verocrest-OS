import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import {
  CompaniesUnavailableError,
  getContactsPage,
  type CompaniesUnavailableReason,
} from '@verocrest/domain-contacts/server';
import { Button } from '@verocrest/ui-kit';
import { ContactsTable } from '@/components/contacts/contacts-table';

export const metadata: Metadata = { title: 'Contacts' };
export const dynamic = 'force-dynamic';

type ClientFilter = 'all' | 'clients' | 'prospects';

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const search = typeof sp.q === 'string' ? sp.q : '';
  const clientFilter: ClientFilter =
    sp.client === 'clients' || sp.client === 'prospects' ? sp.client : 'all';

  let unavailable: CompaniesUnavailableReason | null = null;
  let items: Awaited<ReturnType<typeof getContactsPage>>['items'] = [];
  let nextCursor: string | null = null;

  try {
    const page = await getContactsPage({ search: search || undefined, isClient: clientFilter });
    items = page.items;
    nextCursor = page.nextCursor;
  } catch (error) {
    if (error instanceof CompaniesUnavailableError) unavailable = error.reason;
    else throw error;
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg-strong">Contacts</h1>
          <p className="text-sm text-fg-muted">The people you sell to.</p>
        </div>
        {!unavailable ? (
          <Link href="/contacts/new">
            <Button>
              <PlusIcon className="size-4" strokeWidth={2} />
              New contact
            </Button>
          </Link>
        ) : null}
      </div>

      {unavailable ? (
        <UnavailablePanel reason={unavailable} />
      ) : (
        <ContactsTable
          key={`${search}|${clientFilter}`}
          initialItems={items}
          initialCursor={nextCursor}
          search={search}
          clientFilter={clientFilter}
        />
      )}
    </div>
  );
}

function UnavailablePanel({ reason }: { reason: CompaniesUnavailableReason }) {
  if (reason === 'setup') {
    return (
      <div className="rounded-md border border-warning-surface bg-warning-surface/40 p-4 text-sm">
        <p className="font-medium text-fg-strong">Contacts table not created yet</p>
        <p className="mt-1 text-fg-muted">
          Apply the migration{' '}
          <code className="font-mono text-xs">supabase/migrations/20260703140000_contacts.sql</code>{' '}
          in the Supabase SQL editor, then reload.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-edge bg-surface p-4 text-sm">
      <p className="font-medium text-fg-strong">Can’t load contacts</p>
      <p className="mt-1 text-fg-muted">
        Your workspace context couldn’t be resolved. Try reloading or signing in again.
      </p>
    </div>
  );
}
