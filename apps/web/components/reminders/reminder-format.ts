// Server-safe reminder presentation helpers. NO 'use client' — imported by both
// the Server Component detail page and the client table (avoids the server/client
// boundary trap that bit the leads detail page in Sprint 2.3).
import type { ReminderStatus } from '@verocrest/domain-reminders';
import type { BadgeProps } from '@verocrest/ui-kit';

export function statusVariant(status: ReminderStatus): BadgeProps['variant'] {
  switch (status) {
    case 'completed':
      return 'success';
    case 'snoozed':
      return 'warning';
    case 'dismissed':
      return 'neutral';
    default:
      return 'info'; // pending
  }
}

const OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/**
 * Deterministic UTC rendering — identical on server and client, so it is safe as
 * the SSR/first-hydration value (no mismatch). The client <DateTime> component
 * upgrades to the viewer's local timezone after mount.
 */
export function formatWhenUTC(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { ...OPTS, timeZone: 'UTC' }).format(d);
}

/** Local-timezone rendering — client-only (call after mount). */
export function formatWhenLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, OPTS).format(d);
}
