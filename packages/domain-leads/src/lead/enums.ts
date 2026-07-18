/** Full lifecycle per docs/04 §5.1 lead_status_enum (frozen). */
export const LEAD_STATUSES = [
  'new',
  'enriching',
  'scored',
  'ready',
  'contacted',
  'engaged',
  'nurturing',
  'meeting_booked',
  'meeting_held',
  'proposal_sent',
  'won',
  'lost',
  'disqualified',
  'unsubscribed',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Statuses a human may set in v0.1. 'enriching' / 'scored' / 'ready' are
 * SYSTEM statuses reserved for the Lead Intelligence Engine (Sprint 7) —
 * they render but are not user-selectable.
 */
export const MANUAL_LEAD_STATUSES = [
  'new',
  'contacted',
  'engaged',
  'nurturing',
  'meeting_booked',
  'meeting_held',
  'proposal_sent',
  'won',
  'lost',
  'disqualified',
  'unsubscribed',
] as const satisfies readonly LeadStatus[];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  enriching: 'Enriching',
  scored: 'Scored',
  ready: 'Ready',
  contacted: 'Contacted',
  engaged: 'Engaged',
  nurturing: 'Nurturing',
  meeting_booked: 'Meeting booked',
  meeting_held: 'Meeting held',
  proposal_sent: 'Proposal sent',
  won: 'Won',
  lost: 'Lost',
  disqualified: 'Disqualified',
  unsubscribed: 'Unsubscribed',
};

/** Amendment 001: manual priority, distinct from the AI opportunity score. */
export const LEAD_PRIORITIES = ['low', 'medium', 'high'] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Launch currencies per FR-FIN-008 (docs/02 §4.13); mirrors domain-auth's
 *  workspace list (duplicated — cross-domain imports are forbidden, 03 §5). */
export const LEAD_CURRENCIES = ['AUD', 'CAD', 'GBP', 'NZD', 'EUR', 'USD', 'AED'] as const;
