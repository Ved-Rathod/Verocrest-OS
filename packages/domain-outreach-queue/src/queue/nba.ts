import type { NextBestAction, PriorityBasis } from './types';

/**
 * Deterministic Next-Best-Action decision (docs/04 §8.1, docs/05 §6.3). Pure +
 * unit-tested. Score-driven; readiness-gated branches (e.g. `wait_cooldown` on a
 * cold relationship) stay dormant until Relationship Intelligence ships (D4) — the
 * only cooldown source in v1 is an explicit recent action. Channel is email in v1
 * (ig/linkedin outreach channels are wired in Sprint 9); the enum still carries
 * them for forward-compatibility.
 */

export const QUEUE_VERSION = 1;

export type NbaInput = {
  fitScore: number | null;
  opportunityScore: number | null;
  leadDisqualified: boolean;
  cooldownActive: boolean;
  hasRecommendedOffer: boolean;
};

export type NbaDecision = {
  action: NextBestAction;
  channel: string | null;
  reason: string;
};

export function decideNextBestAction(input: NbaInput): NbaDecision {
  if (input.cooldownActive) {
    return {
      action: 'wait_cooldown',
      channel: null,
      reason: 'A recent action put this lead in cooldown; wait before reaching out again.',
    };
  }
  if (input.leadDisqualified) {
    return { action: 'disqualify', channel: null, reason: 'The lead is marked disqualified.' };
  }
  if (input.fitScore === null) {
    return {
      action: 'schedule_followup',
      channel: null,
      reason: 'The lead has no score yet; schedule a follow-up once it is scored.',
    };
  }
  return {
    action: 'draft_email',
    channel: 'email',
    reason: input.hasRecommendedOffer
      ? 'High-fit lead — open by email leading with the recommended offer.'
      : 'High-fit lead — open the conversation by email.',
  };
}

/** effective_priority = opportunity_score ?? fit_score (transient; orders the rank). */
export function effectivePriority(
  fitScore: number,
  opportunityScore: number | null,
): { basis: PriorityBasis; value: number } {
  return opportunityScore !== null
    ? { basis: 'opportunity', value: opportunityScore }
    : { basis: 'fit', value: fitScore };
}
