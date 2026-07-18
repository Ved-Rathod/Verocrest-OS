// Server-safe lead presentation helpers. NO 'use client' — these are pure
// functions imported by BOTH the Server Component lead-detail page and the
// client leads-table. (Previously colocated in leads-table.tsx, which is a
// 'use client' module, so calling them from the server crossed the boundary.)
import type { LeadPriority, LeadStatus } from '@verocrest/domain-leads';
import type { BadgeProps } from '@verocrest/ui-kit';

export function statusVariant(status: LeadStatus): BadgeProps['variant'] {
  switch (status) {
    case 'won':
      return 'success';
    case 'lost':
    case 'disqualified':
    case 'unsubscribed':
      return 'danger';
    case 'meeting_booked':
    case 'meeting_held':
    case 'proposal_sent':
    case 'engaged':
      return 'info';
    case 'enriching':
    case 'scored':
    case 'ready':
      return 'ai';
    default:
      return 'neutral';
  }
}

export function priorityVariant(priority: LeadPriority): BadgeProps['variant'] {
  return priority === 'high' ? 'warning' : priority === 'medium' ? 'info' : 'neutral';
}

export function formatMoney(value: number | null, currency: string | null): string {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} ${currency ?? ''}`.trim();
  }
}
