import { z } from 'zod';
import { COMPANY_SIZES } from '../icp/types';
import { BILLING_CADENCES, PRICING_MODELS } from './types';

/** Offer input validation (docs/04 §10.6, docs/05 §3.4). Full structured editor. */

const deliverableSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  quantity: z.number().nonnegative().optional(),
  timelineDays: z.number().int().nonnegative().optional(),
});

const guaranteeSchema = z.object({
  type: z.string().trim().min(1, 'Type is required').max(120),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  conditions: z.string().trim().max(2000).optional().or(z.literal('')),
  refundTerms: z.string().trim().max(2000).optional().or(z.literal('')),
});

const onboardingStepSchema = z.object({
  order: z.number().int().nonnegative(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
});

const roiMetricsSchema = z.object({
  expectedLiftPct: z.number().optional(),
  paybackMonths: z.number().nonnegative().optional(),
  evidenceKbDocIds: z.array(z.string().uuid()).optional(),
});

const isoCurrency = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase());

export const offerInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    slug: z.string().trim().max(120).optional().or(z.literal('')),
    shortDescription: z.string().trim().max(280).optional().or(z.literal('')),
    positioning: z.string().trim().max(20_000).optional().or(z.literal('')),
    targetIcpId: z.string().uuid().nullable().optional(),
    targetCompanySize: z.array(z.enum(COMPANY_SIZES)).max(COMPANY_SIZES.length).default([]),
    targetIndustries: z.array(z.string().trim().min(1)).max(50).default([]),
    pricingModel: z.enum(PRICING_MODELS).default('fixed'),
    price: z.number().nonnegative().optional(),
    priceMax: z.number().nonnegative().optional(),
    currency: isoCurrency.optional(),
    billingCadence: z.enum(BILLING_CADENCES).optional(),
    deliverables: z.array(deliverableSchema).max(50).default([]),
    guarantees: z.array(guaranteeSchema).max(50).default([]),
    roiNarrative: z.string().trim().max(20_000).optional().or(z.literal('')),
    roiMetrics: roiMetricsSchema.default({}),
    onboardingSteps: z.array(onboardingStepSchema).max(50).default([]),
    requirements: z.array(z.string().trim().min(1)).max(50).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.price !== undefined && v.priceMax !== undefined && v.priceMax < v.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceMax'],
        message: 'Max price must be ≥ price',
      });
    }
    if ((v.price !== undefined || v.priceMax !== undefined) && !v.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currency'],
        message: 'Currency is required when a price is set',
      });
    }
  });

export type OfferInput = z.infer<typeof offerInputSchema>;

/** URL-safe slug from a name (docs/05 §3.4 "Name + slug"). */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'offer'
  );
}
