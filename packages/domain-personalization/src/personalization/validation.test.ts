import { describe, expect, it } from 'vitest';
import { generatePersonalizationInputSchema, componentsToPreview } from './validation';
import { outreachDraftRowSchema, toPersonalization } from './types';

describe('generatePersonalizationInputSchema', () => {
  it('accepts a valid uuid contactId', () => {
    expect(
      generatePersonalizationInputSchema.safeParse({
        contactId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);
  });
  it('rejects a missing/invalid contactId', () => {
    expect(generatePersonalizationInputSchema.safeParse({ contactId: 'nope' }).success).toBe(false);
    expect(generatePersonalizationInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('componentsToPreview', () => {
  it('assembles a deterministic preview from the components', () => {
    const preview = componentsToPreview({
      opening_line: 'Hi',
      compliment: 'Nice site',
      website_observation: 'No CTA',
      pain_hypothesis: 'Losing leads',
      value_proposition: 'We fix it',
      cta_suggestion: 'Chat?',
    });
    expect(preview).toBe('Hi\n\nNice site\n\nNo CTA\n\nLosing leads\n\nWe fix it\n\nChat?');
  });
});

describe('outreachDraftRowSchema / toPersonalization', () => {
  const base = {
    id: '22222222-2222-4222-8222-222222222222',
    contact_id: '11111111-1111-4111-8111-111111111111',
    company_id: null,
    offer_id: null,
    personalization: {
      opening_line: 'a',
      compliment: 'b',
      website_observation: 'c',
      pain_hypothesis: 'd',
      value_proposition: 'e',
      cta_suggestion: 'f',
      confidence: 80,
    },
    body: 'a\n\nb',
    citations: { memory_ids: ['m1'], icp_id: 'icp1', offer_ids: ['o1'], audit_id: null },
    model: 'mock-model',
    created_at: '2026-07-20T00:00:00Z',
  };

  it('maps a row to a Personalization view', () => {
    const p = toPersonalization(outreachDraftRowSchema.parse(base));
    expect(p.components.confidence).toBe(80);
    expect(p.citations?.memoryIds).toEqual(['m1']);
    expect(p.citations?.icpId).toBe('icp1');
    expect(p.bodyPreview).toContain('a');
  });

  it('rejects an out-of-range confidence', () => {
    expect(
      outreachDraftRowSchema.safeParse({
        ...base,
        personalization: { ...base.personalization, confidence: 150 },
      }).success,
    ).toBe(false);
  });

  it('tolerates null citations', () => {
    const p = toPersonalization(outreachDraftRowSchema.parse({ ...base, citations: null }));
    expect(p.citations).toBeNull();
  });
});
