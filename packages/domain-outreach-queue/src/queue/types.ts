/**
 * Outreach Queue domain types (docs/04 §8.1 as amended by Amendment 012). Keys
 * mirror the frozen `outreach_queue_items` columns; `reasoning` is the D10
 * explainability record.
 */

export type NextBestAction =
  | 'draft_email'
  | 'draft_ig_dm'
  | 'draft_linkedin_dm'
  | 'send_loom'
  | 'schedule_followup'
  | 'wait_cooldown'
  | 'present_offer'
  | 'disqualify';

/** The value that actually orders the queue (transient — never a stored column). */
export type PriorityBasis = 'opportunity' | 'fit';

export type QueueReasoning = {
  version: number;
  priority: {
    basis: PriorityBasis;
    /** effective_priority = opportunity_score ?? fit_score. */
    value: number;
    note: string;
  };
  nextBestAction: {
    action: NextBestAction;
    channel: string | null;
    reason: string;
  };
  recommendedOffer: {
    offerId: string;
    offerName: string;
    rationale: string;
    confidence: number;
    aiAvailable: boolean;
  } | null;
};

/** A materialized queue item (read shape for the UI). */
export type QueueItem = {
  leadId: string;
  contactId: string;
  companyId: string | null;
  contactName: string;
  companyName: string | null;
  recommendedOfferId: string | null;
  recommendedOfferName: string | null;
  opportunityScore: number | null;
  nextBestAction: NextBestAction;
  channelPreference: string | null;
  reasoning: QueueReasoning;
  cooldownUntil: string | null;
  priorityRank: number;
  computedAt: string;
  expiresAt: string;
};

/** Outcome of a recompute attempt (queue-subsystem concern, not a CRM status). */
export type RecomputeOutcome =
  | { status: 'queued'; item: QueueItem }
  | { status: 'not_scored'; reason: string }
  | { status: 'lead_not_found' };

export const NEXT_BEST_ACTION_LABELS: Record<NextBestAction, string> = {
  draft_email: 'Draft email',
  draft_ig_dm: 'Draft Instagram DM',
  draft_linkedin_dm: 'Draft LinkedIn DM',
  send_loom: 'Send Loom',
  schedule_followup: 'Schedule follow-up',
  wait_cooldown: 'Wait (cooldown)',
  present_offer: 'Present offer',
  disqualify: 'Disqualify',
};
