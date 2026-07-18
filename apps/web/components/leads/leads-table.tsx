'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PencilIcon, SearchIcon, Trash2Icon, UserSearchIcon } from 'lucide-react';
import { loadLeadsPageAction } from '@verocrest/domain-leads/actions';
import {
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  LEAD_STATUS_LABELS,
  MANUAL_LEAD_STATUSES,
  leadContactName,
  type Lead,
} from '@verocrest/domain-leads';
import { Badge, Button, cn } from '@verocrest/ui-kit';
import { DeleteLeadDialog } from './delete-lead-dialog';
import { formatMoney, priorityVariant, statusVariant } from './lead-format';

export function LeadsTable({
  initialItems,
  initialCursor,
  search,
  status,
  priority,
}: {
  initialItems: Lead[];
  initialCursor: string | null;
  search: string;
  status: string;
  priority: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [, startTransition] = useTransition();

  function applyFilters(next: { q?: string; status?: string; priority?: string }) {
    const params = new URLSearchParams();
    const q = next.q ?? search;
    const s = next.status ?? status;
    const p = next.priority ?? priority;
    if (q) params.set('q', q);
    if (s) params.set('status', s);
    if (p) params.set('priority', p);
    startTransition(() => router.push(`/leads${params.toString() ? `?${params}` : ''}`));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setLoadError(null);
    const result = await loadLeadsPageAction({ search, status, priority, cursor });
    if (result.error) setLoadError(result.error.message);
    else if (result.data) {
      setItems((prev) => [...prev, ...result.data!.items]);
      setCursor(result.data.nextCursor);
    }
    setLoadingMore(false);
  }

  const isFiltered = search !== '' || status !== '' || priority !== '';
  const filterSelect = cn(
    'h-9 rounded-md border border-edge bg-surface-2 px-2 text-xs text-fg',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filters (docs/07 §7.7) */}
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
            placeholder="Search by contact name, email, or company"
            className="h-9 w-full rounded-md border border-edge bg-surface-2 pl-8 pr-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </form>
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => applyFilters({ status: e.target.value })}
            className={filterSelect}
          >
            <option value="">All statuses</option>
            {MANUAL_LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by priority"
            value={priority}
            onChange={(e) => applyFilters({ priority: e.target.value })}
            className={filterSelect}
          >
            <option value="">All priorities</option>
            {LEAD_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {LEAD_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          filtered={isFiltered}
          onClear={() => applyFilters({ q: '', status: '', priority: '' })}
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-edge-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge-subtle bg-surface text-left text-xs text-fg-muted">
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Company</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">Priority</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Value</th>
                <th className="hidden px-3 py-2 font-medium xl:table-cell">Close date</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => {
                const name = leadContactName(lead.contact);
                return (
                  <tr
                    key={lead.id}
                    className="group border-b border-edge-subtle last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium text-fg hover:text-primary"
                      >
                        {name}
                      </Link>
                    </td>
                    <td className="hidden px-3 py-2 text-fg-muted md:table-cell">
                      {lead.company?.name ?? lead.contact.companyName ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(lead.status)}>
                        {LEAD_STATUS_LABELS[lead.status]}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-2 lg:table-cell">
                      {lead.priority ? (
                        <Badge variant={priorityVariant(lead.priority)}>
                          {LEAD_PRIORITY_LABELS[lead.priority]}
                        </Badge>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-fg-muted sm:table-cell">
                      {formatMoney(lead.estimatedValue, lead.currency)}
                    </td>
                    <td className="hidden px-3 py-2 text-fg-muted xl:table-cell">
                      {lead.expectedCloseDate ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Link
                          href={`/leads/${lead.id}/edit`}
                          aria-label={`Edit lead for ${name}`}
                          className="rounded-sm p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg"
                        >
                          <PencilIcon className="size-4" strokeWidth={1.75} />
                        </Link>
                        <button
                          aria-label={`Archive lead for ${name}`}
                          onClick={() => setDeleteTarget({ id: lead.id, name })}
                          className="rounded-sm p-1.5 text-fg-muted hover:bg-danger-surface hover:text-danger"
                        >
                          <Trash2Icon className="size-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      <DeleteLeadDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          setItems((prev) => prev.filter((l) => l.id !== id));
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
        <p className="text-sm font-medium text-fg">No leads match your filters</p>
        <button onClick={onClear} className="text-sm text-primary hover:text-primary-hover">
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-edge py-14 text-center">
      <UserSearchIcon aria-hidden="true" className="size-8 text-fg-subtle" strokeWidth={1.75} />
      <div>
        <p className="text-sm font-medium text-fg">No leads yet</p>
        <p className="mt-1 max-w-xs text-xs text-fg-muted">
          A lead is a contact you&apos;re actively pursuing. Create one to start tracking the
          pipeline.
        </p>
      </div>
      <Link href="/leads/new">
        <Button>Create your first lead</Button>
      </Link>
    </div>
  );
}
