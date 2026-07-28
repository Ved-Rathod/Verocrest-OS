import { describe, expect, it } from 'vitest';
import { createMockProvider } from '@verocrest/platform-integrations/llm';
import { scoreLeadOutputSchema, MOCK_SCORE_LEAD } from './scoring';

/**
 * Guards D2: the keyless Mock provider must emit `score-lead` explainability that
 * conforms to the capability's schema, so lead scoring is fully testable +
 * runnable without external AI providers (RN-001 defers the OpenAI adapter).
 */
describe('score-lead mock conformance', () => {
  it('MOCK_SCORE_LEAD conforms to the schema', () => {
    expect(scoreLeadOutputSchema.safeParse(MOCK_SCORE_LEAD).success).toBe(true);
  });

  it('the Mock provider returns schema-conformant JSON for the capability', async () => {
    const mock = createMockProvider();
    const completion = await mock.complete({
      model: 'mock-model',
      messages: [
        { role: 'system', content: 'Reply with ONLY a JSON object.' },
        { role: 'user', content: 'Lead: Acme Dental' },
      ],
      maxOutputTokens: 1024,
      capability: 'score-lead',
    });
    const parsed = scoreLeadOutputSchema.safeParse(JSON.parse(completion.text));
    expect(parsed.success).toBe(true);
  });
});
