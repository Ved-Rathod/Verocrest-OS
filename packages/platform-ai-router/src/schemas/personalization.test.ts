import { describe, expect, it } from 'vitest';
import { createMockProvider } from '@verocrest/platform-integrations/llm';
import { personalizationOutputSchema, MOCK_PERSONALIZATION } from './personalization';

/**
 * Guards D4: the keyless Mock provider must emit `generate-personalization`
 * output that conforms to the capability's schema, so the capability is fully
 * testable + runnable without external AI providers.
 */
describe('generate-personalization mock conformance', () => {
  it('MOCK_PERSONALIZATION conforms to the schema', () => {
    expect(personalizationOutputSchema.safeParse(MOCK_PERSONALIZATION).success).toBe(true);
  });

  it('the Mock provider returns schema-conformant JSON for the capability', async () => {
    const mock = createMockProvider();
    const completion = await mock.complete({
      model: 'mock-model',
      messages: [
        { role: 'system', content: 'Reply with ONLY a JSON object.' },
        { role: 'user', content: 'Company: Acme' },
      ],
      maxOutputTokens: 1024,
      capability: 'generate-personalization',
    });
    const parsed = personalizationOutputSchema.safeParse(JSON.parse(completion.text));
    expect(parsed.success).toBe(true);
  });

  it('falls back to prose for non-structured capabilities', async () => {
    const mock = createMockProvider();
    const completion = await mock.complete({
      model: 'mock-model',
      messages: [{ role: 'user', content: 'hello' }],
      maxOutputTokens: 256,
      capability: 'summarize-thread',
    });
    expect(completion.text).toContain('[mock:');
  });
});
