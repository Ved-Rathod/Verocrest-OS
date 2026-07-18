'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BellIcon, CheckIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import {
  completeReminderAction,
  loadRemindersPageAction,
  snoozeReminderAction,
} from '@verocrest/domain-reminders/actions';
import {
  REMINDER_ENTITY_LABELS,
  REMINDER_STATUS_LABELS,
  REMINDER_STATUSES,
  SELECTABLE_ENTITY_TYPES,
  isOverdue,
  type Reminder,
} from '@verocrest/domain-reminders';
import { Badge, Button, cn } from '@verocrest/ui-kit';
import { statusVariant } from './reminder-format';
import { DateTime } from './date-time';
import { SnoozeControl } from './snooze-control';
import { ArchiveReminderDialog } from './archive-reminder-dialog';

export function RemindersTable({
  initialItems,
  initialCursor,
  status,
  entityType,
}: {
  initialItems: Reminder[];
  initialCursor: string | null;
  status: string;
  entityType: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; label: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function applyFilters(next: { status?: string; entityType?: string }) {
    const params = new URLSearchParams();
    const s = next.status ?? status;
    const e = next.entityType ?? entityType;
    if (s) params.set('status', s);
    if (e) params.set('entityType', e);
    startTransition(() => router.push(`/reminders${params.toString() ? `?${params}` : ''}`));
  }

  function patchItem(id: string, patch: Partial<Reminder>) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function complete(id: string) {
    setBusyId(id);
    const fd = new FormData();
    fd.set('reminderId', id);
    const result = await completeReminderAction(null, fd);
    setBusyId(null);
    if (result.data?.reminder) {
      patchItem(id, {
        status: result.data.reminder.status,
        completedAt: result.data.reminder.completedAt,
      });
      router.refresh();
    }
  }

  async function snooze(id: string, untilIso: string) {
    setBusyId(id);
    const fd = new FormData();
    fd.set('reminderId', id);
    fd.set('until', untilIso);
    const result = await snoozeReminderAction(null, fd);
    setBusyId(null);
    if (result.data?.reminder) {
      patchItem(id, {
        status: result.data.reminder.status,
        snoozedUntil: result.data.reminder.snoozedUntil,
      });
      router.refresh();
    }
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setLoadError(null);
    const result = await loadRemindersPageAction({ status, entityType, cursor });
    if (result.error) setLoadError(result.error.message);
    else if (result.data) {
      setItems((prev) => [...prev, ...result.data!.items]);
      setCursor(result.data.nextCursor);
    }
    setLoadingMore(false);
  }

  const isFiltered = status !== '' || entityType !== '';
  const filterSelect = cn(
    'h-9 rounded-md border border-edge bg-surface-2 px-2 text-xs text-fg',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => applyFilters({ status: e.target.value })}
          className={filterSelect}
        >
          <option value="">All statuses</option>
          {REMINDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REMINDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by type"
          value={entityType}
          onChange={(e) => applyFilters({ entityType: e.target.value })}
          className={filterSelect}
        >
          <option value="">All types</option>
          {SELECTABLE_ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {REMINDER_ENTITY_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <EmptyState
          filtered={isFiltered}
          onClear={() => applyFilters({ status: '', entityType: '' })}
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-edge-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge-subtle bg-surface text-left text-xs text-fg-muted">
                <th className="px-3 py-2 font-medium">About</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Note</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const overdue = isOverdue(r);
                const active = r.status === 'pending' || r.status === 'snoozed';
                return (
                  <tr
                    key={r.id}
                    className="group border-b border-edge-subtle last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded-sm bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted">
                          {REMINDER_ENTITY_LABELS[r.entityType]}
                        </span>
                        {r.entity?.href ? (
                          <Link
                            href={r.entity.href}
                            className="truncate font-medium text-fg hover:text-primary"
                          >
                            {r.entity.label}
                          </Link>
                        ) : (
                          <span
                            className={cn(
                              'truncate font-medium',
                              r.entity?.exists === false ? 'text-fg-subtle italic' : 'text-fg',
                            )}
                          >
                            {r.entity?.label ?? '—'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden max-w-xs px-3 py-2 text-fg-muted md:table-cell">
                      <span className="line-clamp-1">{r.note ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <DateTime
                        iso={r.snoozedUntil ?? r.dueAt}
                        className={cn(
                          'whitespace-nowrap',
                          overdue ? 'font-medium text-danger' : 'text-fg-muted',
                        )}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(r.status)}>
                        {REMINDER_STATUS_LABELS[r.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {active ? (
                          <>
                            <button
                              aria-label="Complete reminder"
                              disabled={busyId === r.id}
                              onClick={() => complete(r.id)}
                              className="rounded-sm p-1.5 text-fg-muted hover:bg-success-surface hover:text-success disabled:opacity-40"
                            >
                              <CheckIcon className="size-4" strokeWidth={1.75} />
                            </button>
                            <SnoozeControl
                              compact
                              disabled={busyId === r.id}
                              onSnooze={(iso) => snooze(r.id, iso)}
                            />
                          </>
                        ) : null}
                        <Link
                          href={`/reminders/${r.id}/edit`}
                          aria-label="Edit reminder"
                          className="rounded-sm p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg"
                        >
                          <PencilIcon className="size-4" strokeWidth={1.75} />
                        </Link>
                        <button
                          aria-label="Archive reminder"
                          onClick={() =>
                            setArchiveTarget({ id: r.id, label: r.entity?.label ?? 'this item' })
                          }
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

      <ArchiveReminderDialog
        target={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={(id) => {
          setItems((prev) => prev.filter((r) => r.id !== id));
          setArchiveTarget(null);
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
        <p className="text-sm font-medium text-fg">No reminders match your filters</p>
        <button onClick={onClear} className="text-sm text-primary hover:text-primary-hover">
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-edge py-14 text-center">
      <BellIcon aria-hidden="true" className="size-8 text-fg-subtle" strokeWidth={1.75} />
      <div>
        <p className="text-sm font-medium text-fg">No reminders yet</p>
        <p className="mt-1 max-w-xs text-xs text-fg-muted">
          Set a follow-up on a contact, lead, or company so nothing slips.
        </p>
      </div>
      <Link href="/reminders/new">
        <Button>Create your first reminder</Button>
      </Link>
    </div>
  );
}
