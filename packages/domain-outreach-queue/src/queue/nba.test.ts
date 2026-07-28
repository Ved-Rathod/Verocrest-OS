import { describe, expect, it } from 'vitest';
import { decideNextBestAction, effectivePriority, type NbaInput } from './nba';

const base: NbaInput = {
  fitScore: 80,
  opportunityScore: null,
  leadDisqualified: false,
  cooldownActive: false,
  hasRecommendedOffer: false,
};

describe('decideNextBestAction', () => {
  it('cooldown wins over everything', () => {
    expect(decideNextBestAction({ ...base, cooldownActive: true }).action).toBe('wait_cooldown');
  });

  it('disqualified lead → disqualify', () => {
    expect(decideNextBestAction({ ...base, leadDisqualified: true }).action).toBe('disqualify');
  });

  it('unscored lead → schedule_followup', () => {
    expect(decideNextBestAction({ ...base, fitScore: null }).action).toBe('schedule_followup');
  });

  it('default high-fit lead → draft_email on email channel', () => {
    const d = decideNextBestAction(base);
    expect(d.action).toBe('draft_email');
    expect(d.channel).toBe('email');
  });

  it('mentions the offer when one is recommended', () => {
    expect(decideNextBestAction({ ...base, hasRecommendedOffer: true }).reason).toMatch(/offer/i);
  });
});

describe('effectivePriority', () => {
  it('uses opportunity when present', () => {
    expect(effectivePriority(80, 45)).toEqual({ basis: 'opportunity', value: 45 });
  });

  it('falls back to fit when opportunity is null (never fabricated)', () => {
    expect(effectivePriority(80, null)).toEqual({ basis: 'fit', value: 80 });
  });
});
