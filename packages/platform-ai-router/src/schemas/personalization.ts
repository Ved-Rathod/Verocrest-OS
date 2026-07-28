import { z } from 'zod';

/**
 * Structured output contract for the `generate-personalization` capability
 * (Milestone M4, docs/09 §2.7). The Router owns capability output schemas; the
 * personalization domain imports this type. Keys are snake_case — the shape the
 * model returns and that persists to `outreach_messages.personalization`.
 */
export const personalizationOutputSchema = z.object({
  opening_line: z.string().min(1),
  compliment: z.string().min(1),
  website_observation: z.string().min(1),
  pain_hypothesis: z.string().min(1),
  value_proposition: z.string().min(1),
  cta_suggestion: z.string().min(1),
  confidence: z.number().int().min(0).max(100),
});

export type PersonalizationOutput = z.infer<typeof personalizationOutputSchema>;

/**
 * Deterministic Mock-provider sample (D4) — lets `generate-personalization` run
 * fully offline. Must conform to the schema above; a router test asserts it does.
 */
export const MOCK_PERSONALIZATION: PersonalizationOutput = {
  opening_line: 'Noticed your team is scaling client acquisition — quick thought.',
  compliment: 'Your positioning around measurable ROI stands out in a noisy space.',
  website_observation: 'Your homepage has a clear offer but no visible booking CTA above the fold.',
  pain_hypothesis: 'You may be losing warm visitors who have no fast path to book a call.',
  value_proposition:
    'We add a friction-free booking path so more of your existing traffic converts.',
  cta_suggestion: 'Open to a 15-minute walkthrough next week?',
  confidence: 72,
};
