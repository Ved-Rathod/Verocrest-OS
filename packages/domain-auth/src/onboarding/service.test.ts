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
  hasAudit: false,
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
  hasAudit: true,
};

const state = { dismissed: false, onboardedAt: null };

describe('buildOnboardingProgress (docs/05 §3, Amendment 007)', () => {
  it('has 8 required steps and 0 coming-soon (Sprint 4.8 closes SPRINT 6)', () => {
    const p = buildOnboardingProgress(EMPTY, state);
    expect(p.requiredTotal).toBe(8);
    expect(p.items).toHaveLength(8);
    expect(p.items.filter((i) => i.status === 'coming_soon')).toHaveLength(0);
    expect(p.items.every((i) => i.required)).toBe(true);
  });

  it('Website Audit is now a required, detectable step (Sprint 4.8)', () => {
    const wa = buildOnboardingProgress(EMPTY, state).items.find((i) => i.key === 'website_audit');
    expect(wa?.required).toBe(true);
    expect(wa?.status).toBe('not_started');
    expect(wa?.href).toBe('/settings/website');
    expect(
      buildOnboardingProgress(ALL, state).items.find((i) => i.key === 'website_audit')?.status,
    ).toBe('done');
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

  it('completes when all eight required steps are done', () => {
    const p = buildOnboardingProgress(ALL, state);
    expect(p.requiredDone).toBe(8);
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
