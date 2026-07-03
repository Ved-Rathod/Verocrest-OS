'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PencilIcon, SearchIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { loadContactsPageAction } from '@verocrest/domain-contacts/actions';
import { displayName, type Contact } from '@verocrest/domain-contacts';
import { Badge, Button, cn } from '@verocrest/ui-kit';
import { DeleteContactDialog } from './delete-contact-dialog';

type ClientFilter = 'all' | 'clients' | 'prospects';

export function ContactsTable({
  initialItems,
  initialCursor,
  search,
  clientFilter,
}: {
  initialItems: Contact[];
  initialCursor: string | null;
  search: string;
  clientFilter: ClientFilter;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [, startTransition] = useTransition();

  function applyFilters(next: { q?: string; client?: ClientFilter }) {
    const params = new URLSearchParams();
    const q = next.q ?? search;
    const client = next.client ?? clientFilter;
    if (q) params.set('q', q);
    if (client !== 'all') params.set('client', client);
    startTransition(() => router.push(`/contacts${params.toString() ? `?${params}` : ''}`));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setLoadError(null);
    const result = await loadContactsPageAction({ search, isClient: clientFilter, cursor });
    if (result.error) setLoadError(result.error.message);
    else if (result.data) {
      setItems((prev) => [...prev, ...result.data!.items]);
      setCursor(result.data.nextCursor);
    }
    setLoadingMore(false);
  }

  const isFiltered = search !== '' || clientFilter !== 'all';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get('q');
            applyFilters({ q: typeof value === 'string' ? value : '' });
          }}
          className="relative flex-1"
        >
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by name, email, or company"
            className="h-9 w-full rounded-md border border-edge bg-surface-2 pl-8 pr-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </form>
        <div className="flex items-center gap-1 rounded-md border border-edge bg-surface-2 p-0.5">
          {(['all', 'clients', 'prospects'] as const).map((f) => (
            <button
              key={f}
              onClick={() => applyFilters({ client: f })}
              className={cn(
                'rounded-sm px-2.5 py-1 text-xs capitalize transition-colors',
                clientFilter === f ? 'bg-surface-3 text-fg-strong' : 'text-fg-muted hover:text-fg',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState filtered={isFiltered} onClear={() => applyFilters({ q: '', client: 'all' })} />
      ) : (
        <div className="overflow-hidden rounded-md border border-edge-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge-subtle bg-surface text-left text-xs text-fg-muted">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Email</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Company</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">Role</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  className="group border-b border-edge-subtle last:border-0 hover:bg-surface-2"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-medium text-fg hover:text-primary"
                    >
                      {displayName(c)}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2 text-fg-muted sm:table-cell">
                    {c.primaryEmail ?? '—'}
                  </td>
                  <td className="hidden px-3 py-2 text-fg-muted md:table-cell">
                    {c.companyName ?? '—'}
                  </td>
                  <td className="hidden px-3 py-2 text-fg-muted lg:table-cell">
                    {c.roleTitle ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    {c.isClient ? (
                      <Badge variant="success">Client</Badge>
                    ) : (
                      <Badge variant="neutral">Prospect</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Link
                        href={`/contacts/${c.id}/edit`}
                        aria-label={`Edit ${displayName(c)}`}
                        className="rounded-sm p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg"
                      >
                        <PencilIcon className="size-4" strokeWidth={1.75} />
                      </Link>
                      <button
                        aria-label={`Delete ${displayName(c)}`}
                        onClick={() => setDeleteTarget({ id: c.id, name: displayName(c) })}
                        className="rounded-sm p-1.5 text-fg-muted hover:bg-danger-surface hover:text-danger"
                      >
                        <Trash2Icon className="size-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}

      {cursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}

      <DeleteContactDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          setItems((prev) => prev.filter((c) => c.id !== id));
          setDeleteTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-edge py-12 text-center">
        <p className="text-sm font-medium text-fg">No contacts match your filters</p>
        <button onClick={onClear} className="text-sm text-primary hover:text-primary-hover">
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-edge py-14 text-center">
      <UsersIcon aria-hidden="true" className="size-8 text-fg-subtle" strokeWidth={1.75} />
      <div>
        <p className="text-sm font-medium text-fg">No contacts yet</p>
        <p className="mt-1 max-w-xs text-xs text-fg-muted">
          Add the people you sell to. Link them to a company to keep everything connected.
        </p>
      </div>
      <Link href="/contacts/new">
        <Button>Add your first contact</Button>
      </Link>
    </div>
  );
}
