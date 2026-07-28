import { z } from 'zod';

/**
 * Structured output contract for the `score-lead` capability (docs/09 §11,
 * Sprint 4.9). Per approved decision D2, the DETERMINISTIC engine owns the
 * numeric scores (fit / ICP match / opportunity); this capability produces the
 * plain-language EXPLAINABILITY layer only — a human-readable summary, the driving
 * signals, and a confidence. The Router owns capability output schemas; the
 * scoring domain imports this type. Keys are snake_case (the shape the model
 * returns).
 */
export const scoreLeadOutputSchema = z.object({
  summary: z.string().min(1),
  signals: z
    .array(
      z.object({
        label: z.string().min(1),
        detail: z.string().min(1),
        direction: z.enum(['positive', 'negative', 'neutral']),
      }),
    )
    .min(1),
  confidence: z.number().int().min(0).max(100),
});

export type ScoreLeadOutput = z.infer<typeof scoreLeadOutputSchema>;

/**
 * Deterministic Mock-provider sample (D2) — lets `score-lead` run fully offline
 * (keyless dev, RN-001 defers the OpenAI adapter). Must conform to the schema
 * above; a router test asserts it does.
 */
export const MOCK_SCORE_LEAD: ScoreLeadOutput = {
  summary:
    'Strong ICP alignment on industry and geography; website intelligence shows conversion gaps that this offer directly addresses.',
  signals: [
    {
      label: 'ICP match',
      detail: 'Company industry and target geography match the active ICP.',
      direction: 'positive',
    },
    {
      label: 'Website intelligence',
      detail: 'Audit flagged a missing booking CTA — a fixable conversion gap.',
      direction: 'positive',
    },
    {
      label: 'Readiness',
      detail: 'Relationship signals are not yet available for this lead.',
      direction: 'neutral',
    },
  ],
  confidence: 68,
};
