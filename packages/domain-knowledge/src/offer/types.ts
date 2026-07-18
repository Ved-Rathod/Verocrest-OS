import { z } from 'zod';
import { COMPANY_SIZES } from '../icp/types';

/** Enums (docs/04 §10.6). */
export const PRICING_MODELS = ['fixed', 'tiered', 'retainer', 'performance', 'custom'] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const OFFER_STATUSES = ['draft', 'active', 'paused', 'retired'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const BILLING_CADENCES = ['one_time', 'monthly', 'quarterly', 'annual'] as const;
export type BillingCadence = (typeof BILLING_CADENCES)[number];

/** Structured jsonb shapes (docs/04 §10.6). */
export type Deliverable = {
  title: string;
  description?: string;
  quantity?: number;
  timelineDays?: number;
};
export type Guarantee = {
  type: string;
  description?: string;
  conditions?: string;
  refundTerms?: string;
};
export type OnboardingStep = { order: number; title: string; description?: string };
export type RoiMetrics = {
  expectedLiftPct?: number;
  paybackMonths?: number;
  evidenceKbDocIds?: string[];
};

export type Offer = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  positioning: string | null;
  targetIcpId: string | null;
  targetCompanySize: string[];
  targetIndustries: string[];
  pricingModel: PricingModel;
  price: number | null;
  priceMax: number | null;
  currency: string | null;
  billingCadence: string | null;
  deliverables: Deliverable[];
  guarantees: Guarantee[];
  roiNarrative: string | null;
  roiMetrics: RoiMetrics;
  onboardingSteps: OnboardingStep[];
  requirements: string[];
  status: OfferStatus;
  version: number;
  isIndexed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OfferListItem = Pick<
  Offer,
  | 'id'
  | 'name'
  | 'slug'
  | 'shortDescription'
  | 'status'
  | 'pricingModel'
  | 'isIndexed'
  | 'updatedAt'
>;

const numOrNull = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((v) => {
    if (v === null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

export const offerRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  short_description: z.string().nullable(),
  positioning: z.string().nullable(),
  target_icp_id: z.string().uuid().nullable(),
  target_company_size: z.array(z.enum(COMPANY_SIZES)),
  target_industries: z.array(z.string()),
  pricing_model: z.enum(PRICING_MODELS),
  price: numOrNull,
  price_max: numOrNull,
  currency: z.string().nullable(),
  billing_cadence: z.string().nullable(),
  deliverables: z.array(z.record(z.string(), z.unknown())),
  guarantees: z.array(z.record(z.string(), z.unknown())),
  roi_narrative: z.string().nullable(),
  roi_metrics: z.record(z.string(), z.unknown()),
  onboarding_steps: z.array(z.record(z.string(), z.unknown())),
  requirements: z.array(z.unknown()),
  status: z.enum(OFFER_STATUSES),
  version: z.number().int(),
  is_indexed: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

function deliverable(r: Record<string, unknown>): Deliverable {
  return {
    title: String(r['title'] ?? ''),
    ...(r['description'] != null ? { description: String(r['description']) } : {}),
    ...(r['quantity'] != null ? { quantity: Number(r['quantity']) } : {}),
    ...(r['timelineDays'] != null ? { timelineDays: Number(r['timelineDays']) } : {}),
  };
}
function guarantee(r: Record<string, unknown>): Guarantee {
  return {
    type: String(r['type'] ?? ''),
    ...(r['description'] != null ? { description: String(r['description']) } : {}),
    ...(r['conditions'] != null ? { conditions: String(r['conditions']) } : {}),
    ...(r['refundTerms'] != null ? { refundTerms: String(r['refundTerms']) } : {}),
  };
}
function onboardingStep(r: Record<string, unknown>): OnboardingStep {
  return {
    order: Number(r['order'] ?? 0),
    title: String(r['title'] ?? ''),
    ...(r['description'] != null ? { description: String(r['description']) } : {}),
  };
}

export function toOffer(row: z.infer<typeof offerRowSchema>): Offer {
  const m = row.roi_metrics;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    positioning: row.positioning,
    targetIcpId: row.target_icp_id,
    targetCompanySize: row.target_company_size,
    targetIndustries: row.target_industries,
    pricingModel: row.pricing_model,
    price: row.price,
    priceMax: row.price_max,
    currency: row.currency,
    billingCadence: row.billing_cadence,
    deliverables: row.deliverables.map(deliverable),
    guarantees: row.guarantees.map(guarantee),
    roiNarrative: row.roi_narrative,
    roiMetrics: {
      ...(m['expectedLiftPct'] != null ? { expectedLiftPct: Number(m['expectedLiftPct']) } : {}),
      ...(m['paybackMonths'] != null ? { paybackMonths: Number(m['paybackMonths']) } : {}),
      ...(Array.isArray(m['evidenceKbDocIds'])
        ? { evidenceKbDocIds: (m['evidenceKbDocIds'] as unknown[]).map(String) }
        : {}),
    },
    onboardingSteps: row.onboarding_steps.map(onboardingStep),
    requirements: row.requirements.map(String),
    status: row.status,
    version: row.version,
    isIndexed: row.is_indexed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const OFFER_SELECT =
  'id, slug, name, short_description, positioning, target_icp_id, target_company_size, target_industries, pricing_model, price, price_max, currency, billing_cadence, deliverables, guarantees, roi_narrative, roi_metrics, onboarding_steps, requirements, status, version, is_indexed, created_at, updated_at';
