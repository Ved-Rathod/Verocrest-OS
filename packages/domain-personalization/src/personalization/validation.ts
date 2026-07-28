import { z } from 'zod';

/** Personalization generation input (Milestone M4). v0.1 targets a contact. */
export const generatePersonalizationInputSchema = z.object({
  contactId: z.string().uuid('Select a contact'),
});

export type GeneratePersonalizationInput = z.infer<typeof generatePersonalizationInputSchema>;

/**
 * Assemble the human-reviewable preview body from the structured components.
 * Deterministic (no AI) — a stable, greppable representation stored in
 * outreach_messages.body (which is NOT NULL).
 */
export function componentsToPreview(c: {
  opening_line: string;
  compliment: string;
  website_observation: string;
  pain_hypothesis: string;
  value_proposition: string;
  cta_suggestion: string;
}): string {
  return [
    c.opening_line,
    c.compliment,
    c.website_observation,
    c.pain_hypothesis,
    c.value_proposition,
    c.cta_suggestion,
  ]
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .join('\n\n');
}
