'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Building2Icon, PencilIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { loadCompaniesPageAction } from '@verocrest/domain-contacts/actions';
import { COMPANY_SIZE_LABELS, type Company } from '@verocrest/domain-contacts';
import { Badge, Button, cn } from '@verocrest/ui-kit';
import { DeleteCompanyDialog } from './delete-company-dialog';

type ClientFilter = 'all' | 'clients' | 'prospects';

export function CompaniesTable({
  initialItems,
  initialCursor,
  search,
  clientFilter,
}: {
  initialItems: Company[];
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
    startTransition(() => router.push(`/companies${params.toString() ? `?${params}` : ''}`));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setLoadError(null);
    const result = await loadCompaniesPageAction({ search, isClient: clientFilter, cursor });
    if (result.error) {
      setLoadError(result.error.message);
    } else if (result.data) {
      setItems((prev) => [...prev, ...result.data!.items]);
      setCursor(result.data.nextCursor);
    }
    setLoadingMore(false);
  }

  const isFiltered = search !== '' || clientFilter !== 'all';

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filter bar (docs/07 §7.7) */}
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
            placeholder="Search by name or domain"
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
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Domain</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Industry</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">Size</th>
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
                      href={`/companies/${c.id}/edit`}
                      className="font-medium text-fg hover:text-primary"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2 text-fg-muted sm:table-cell">
                    {c.domain ?? '—'}
                  </td>
                  <td className="hidden px-3 py-2 text-fg-muted md:table-cell">
                    {c.industry ?? '—'}
                  </td>
                  <td className="hidden px-3 py-2 text-fg-muted lg:table-cell">
                    {c.size ? COMPANY_SIZE_LABELS[c.size] : '—'}
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
                        href={`/companies/${c.id}/edit`}
                        aria-label={`Edit ${c.name}`}
                        className="rounded-sm p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg"
                      >
                        <PencilIcon className="size-4" strokeWidth={1.75} />
                      </Link>
                      <button
                        aria-label={`Delete ${c.name}`}
                        onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
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

      <DeleteCompanyDialog
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
    // Filtered-empty (docs/07 §9.1) — distinct from first-time empty.
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-edge py-12 text-center">
        <p className="text-sm font-medium text-fg">No companies match your filters</p>
        <button onClick={onClear} className="text-sm text-primary hover:text-primary-hover">
          Clear filters
        </button>
      </div>
    );
  }
  // First-time empty (docs/07 §9.1) — what's missing + how to fix it.
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-edge py-14 text-center">
      <Building2Icon aria-hidden="true" className="size-8 text-fg-subtle" strokeWidth={1.75} />
      <div>
        <p className="text-sm font-medium text-fg">No companies yet</p>
        <p className="mt-1 max-w-xs text-xs text-fg-muted">
          Add the organizations you sell to. Contacts and leads attach to them later.
        </p>
      </div>
      <Link href="/companies/new">
        <Button>Add your first company</Button>
      </Link>
    </div>
  );
}
