import { z } from 'zod';
import {
  personalizationOutputSchema,
  type PersonalizationOutput,
} from '@verocrest/platform-ai-router';

/**
 * Personalization view (Milestone M4). Persisted on the frozen `outreach_messages`
 * draft (docs/04 §9.1) with the structured components in the additive
 * `personalization` jsonb column. This view exposes them for review — the raw
 * message body/status/channel stay on the underlying draft.
 */

export type PersonalizationComponents = PersonalizationOutput;

export const PERSONALIZATION_COMPONENT_LABELS: Record<keyof PersonalizationComponents, string> = {
  opening_line: 'Opening line',
  compliment: 'Compliment',
  website_observation: 'Website observation',
  pain_hypothesis: 'Pain hypothesis',
  value_proposition: 'Value proposition',
  cta_suggestion: 'CTA suggestion',
  confidence: 'Confidence',
};

export type PersonalizationCitations = {
  memoryIds: string[];
  icpId: string | null;
  offerIds: string[];
  auditId: string | null;
};

export type Personalization = {
  id: string;
  contactId: string;
  companyId: string | null;
  offerId: string | null;
  components: PersonalizationComponents;
  bodyPreview: string;
  citations: PersonalizationCitations | null;
  model: string | null;
  createdAt: string;
};

const citationsSchema = z
  .object({
    memory_ids: z.array(z.string()).optional(),
    icp_id: z.string().nullable().optional(),
    offer_ids: z.array(z.string()).optional(),
    audit_id: z.string().nullable().optional(),
  })
  .nullable();

export const outreachDraftRowSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid(),
  company_id: z.string().uuid().nullable(),
  offer_id: z.string().uuid().nullable(),
  personalization: personalizationOutputSchema,
  body: z.string(),
  citations: citationsSchema,
  model: z.string().nullable(),
  created_at: z.string(),
});

export function toPersonalization(row: z.infer<typeof outreachDraftRowSchema>): Personalization {
  const c = row.citations;
  return {
    id: row.id,
    contactId: row.contact_id,
    companyId: row.company_id,
    offerId: row.offer_id,
    components: row.personalization,
    bodyPreview: row.body,
    citations: c
      ? {
          memoryIds: c.memory_ids ?? [],
          icpId: c.icp_id ?? null,
          offerIds: c.offer_ids ?? [],
          auditId: c.audit_id ?? null,
        }
      : null,
    model: row.model,
    createdAt: row.created_at,
  };
}

export const PERSONALIZATION_SELECT =
  'id, contact_id, company_id, offer_id, personalization, body, citations, model, created_at';
