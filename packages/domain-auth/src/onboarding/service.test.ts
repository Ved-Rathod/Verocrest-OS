import { describe, expect, it } from 'vitest';
import { buildOnboardingProgress, type OnboardingSignals } from './service';

const EMPTY: OnboardingSignals = {
  googleConnected: false,
  companyCount: 0,
  activeIcp: false,
  activeOffer: false,
  knowledgeDocCount: 0,
  knowledgeDocTypeCount: 0,
  leadCount: 0,
  hasTarget: false,
};

const ALL: OnboardingSignals = {
  googleConnected: true,
  companyCount: 2,
  activeIcp: true,
  activeOffer: true,
  knowledgeDocCount: 3,
  knowledgeDocTypeCount: 2,
  leadCount: 5,
  hasTarget: true,
};

const state = { dismissed: false, onboardedAt: null };

describe('buildOnboardingProgress (docs/05 §3, Amendment 007)', () => {
  it('has 7 required steps and 1 non-blocking coming-soon step (Sprint 4.7)', () => {
    const p = buildOnboardingProgress(EMPTY, state);
    expect(p.requiredTotal).toBe(7);
    expect(p.items).toHaveLength(8);
    const comingSoon = p.items.filter((i) => i.status === 'coming_soon');
    expect(comingSoon.map((i) => i.key)).toEqual(['website_audit']);
    expect(comingSoon.every((i) => !i.required)).toBe(true);
  });

  it('Revenue Target is now a required, detectable step (Sprint 4.7)', () => {
    const rt = buildOnboardingProgress(EMPTY, state).items.find((i) => i.key === 'revenue_target');
    expect(rt?.required).toBe(true);
    expect(rt?.status).toBe('not_started');
    expect(rt?.href).toBe('/settings/revenue/new');
    expect(
      buildOnboardingProgress(ALL, state).items.find((i) => i.key === 'revenue_target')?.status,
    ).toBe('done');
  });

  it('includes the founder-approved "Create first Company" required step', () => {
    const company = buildOnboardingProgress(EMPTY, state).items.find((i) => i.key === 'company');
    expect(company?.required).toBe(true);
    expect(company?.href).toBe('/companies/new');
  });

  it('is incomplete with nothing done', () => {
    const p = buildOnboardingProgress(EMPTY, state);
    expect(p.requiredDone).toBe(0);
    expect(p.complete).toBe(false);
  });

  it('completes when all seven required steps are done — coming-soon does NOT block', () => {
    const p = buildOnboardingProgress(ALL, state);
    expect(p.requiredDone).toBe(7);
    expect(p.complete).toBe(true);
  });

  it('KB step needs >=3 docs across >=2 types', () => {
    const twoTypesButTwoDocs = buildOnboardingProgress(
      { ...ALL, knowledgeDocCount: 2, knowledgeDocTypeCount: 2 },
      state,
    );
    expect(twoTypesButTwoDocs.items.find((i) => i.key === 'knowledge')?.status).toBe('not_started');
    const threeDocsOneType = buildOnboardingProgress(
      { ...ALL, knowledgeDocCount: 3, knowledgeDocTypeCount: 1 },
      state,
    );
    expect(threeDocsOneType.items.find((i) => i.key === 'knowledge')?.status).toBe('not_started');
    expect(threeDocsOneType.complete).toBe(false);
  });

  it('carries dismissed + onboardedAt state through', () => {
    const p = buildOnboardingProgress(ALL, {
      dismissed: true,
      onboardedAt: '2026-07-19T00:00:00Z',
    });
    expect(p.dismissed).toBe(true);
    expect(p.onboardedAt).toBe('2026-07-19T00:00:00Z');
  });
});
