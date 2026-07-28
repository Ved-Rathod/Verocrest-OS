import { z } from 'zod';

/**
 * Structured output contract for the `recommend-offer` capability (docs/09 §4.3,
 * §11; Sprint 5.0). The Outreach Queue's deterministic engine decides the
 * next_best_action + ranking; this capability recommends WHICH offer to lead with
 * and explains why, grounded in ICP/offer/company/audit/KB memory. It returns an
 * `offer_ref` — a 1-based index into the candidate offers passed in the prompt —
 * so the domain maps it back to a real offer id (the model never emits ids).
 */
export const recommendOfferOutputSchema = z.object({
  /** 1-based index into the provided candidate offers, or 0 for "no offer fits". */
  offer_ref: z.number().int().min(0),
  rationale: z.string().min(1),
  confidence: z.number().int().min(0).max(100),
});

export type RecommendOfferOutput = z.infer<typeof recommendOfferOutputSchema>;

/**
 * Deterministic Mock-provider sample (keyless dev; RN-001 defers OpenAI). Must
 * conform to the schema above; a router test asserts it does.
 */
export const MOCK_RECOMMEND_OFFER: RecommendOfferOutput = {
  offer_ref: 1,
  rationale:
    'This offer targets the same industry as the lead and directly addresses the conversion gap surfaced by the website analysis.',
  confidence: 64,
};
