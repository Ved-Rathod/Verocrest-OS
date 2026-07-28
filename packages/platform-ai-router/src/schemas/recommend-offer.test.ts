import { describe, expect, it } from 'vitest';
import { createMockProvider } from '@verocrest/platform-integrations/llm';
import { recommendOfferOutputSchema, MOCK_RECOMMEND_OFFER } from './recommend-offer';

/**
 * Guards D7: the keyless Mock provider must emit `recommend-offer` output that
 * conforms to the capability's schema, so the Outreach Queue runs without external
 * AI providers (RN-001 defers the OpenAI adapter).
 */
describe('recommend-offer mock conformance', () => {
  it('MOCK_RECOMMEND_OFFER conforms to the schema', () => {
    expect(recommendOfferOutputSchema.safeParse(MOCK_RECOMMEND_OFFER).success).toBe(true);
  });

  it('the Mock provider returns schema-conformant JSON for the capability', async () => {
    const mock = createMockProvider();
    const completion = await mock.complete({
      model: 'mock-model',
      messages: [
        { role: 'system', content: 'Reply with ONLY a JSON object.' },
        { role: 'user', content: 'Offers:\n1. Growth retainer' },
      ],
      maxOutputTokens: 512,
      capability: 'recommend-offer',
    });
    const parsed = recommendOfferOutputSchema.safeParse(JSON.parse(completion.text));
    expect(parsed.success).toBe(true);
  });
});
