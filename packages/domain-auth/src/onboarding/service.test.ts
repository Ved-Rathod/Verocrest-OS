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
};

const ALL: OnboardingSignals = {
  googleConnected: true,
  companyCount: 2,
  activeIcp: true,
  activeOffer: true,
  knowledgeDocCount: 3,
  knowledgeDocTypeCount: 2,
  leadCount: 5,
};

const state = { dismissed: false, onboardedAt: null };

describe('buildOnboardingProgress (docs/05 §3, Amendment 007)', () => {
  it('has 6 required steps and 2 non-blocking coming-soon steps', () => {
    const p = buildOnboardingProgress(EMPTY, state);
    expect(p.requiredTotal).toBe(6);
    expect(p.items).toHaveLength(8);
    const comingSoon = p.items.filter((i) => i.status === 'coming_soon');
    expect(comingSoon.map((i) => i.key)).toEqual(['revenue_target', 'website_audit']);
    expect(comingSoon.every((i) => !i.required)).toBe(true);
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

  it('completes when all six required steps are done — coming-soon does NOT block', () => {
    const p = buildOnboardingProgress(ALL, state);
    expect(p.requiredDone).toBe(6);
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
