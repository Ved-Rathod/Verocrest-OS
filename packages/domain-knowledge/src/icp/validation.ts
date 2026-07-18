import { z } from 'zod';
import { COMPANY_SIZES } from './types';

/**
 * ICP input validation (docs/05 §3.3). The form captures the narrative + targeting
 * fields; a minimal `criteria` JSON (docs/04 §5.8 shape) is DERIVED from them so
 * SPRINT 7 scoring has a structured contract without a full signals/weights editor
 * this sprint (deferred — not built speculatively).
 */

const isoCurrency = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase());

export const icpInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    shortDescription: z.string().trim().max(280).optional().or(z.literal('')),
    narrative: z.string().trim().min(1, 'Narrative is required').max(20_000),
    targetIndustries: z.array(z.string().trim().min(1)).max(50).default([]),
    targetGeographies: z.array(z.string().trim().length(2)).max(100).default([]),
    targetSize: z.array(z.enum(COMPANY_SIZES)).max(COMPANY_SIZES.length).default([]),
    targetRevenueMin: z.number().nonnegative().optional(),
    targetRevenueMax: z.number().nonnegative().optional(),
    targetRevenueCurrency: isoCurrency.optional(),
    disqualifiers: z.array(z.string().trim().min(1)).max(50).default([]),
  })
  .superRefine((v, ctx) => {
    if (
      v.targetRevenueMin !== undefined &&
      v.targetRevenueMax !== undefined &&
      v.targetRevenueMax < v.targetRevenueMin
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetRevenueMax'],
        message: 'Max revenue must be ≥ min revenue',
      });
    }
    if (
      (v.targetRevenueMin !== undefined || v.targetRevenueMax !== undefined) &&
      !v.targetRevenueCurrency
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetRevenueCurrency'],
        message: 'Currency is required when a revenue range is set',
      });
    }
  });

export type IcpInput = z.infer<typeof icpInputSchema>;

/** Derive the §5.8 criteria JSON from targeting fields. Signals/weights editor is
 *  deferred to when SPRINT 7 scoring consumes them. */
export function buildCriteria(input: IcpInput): Record<string, unknown> {
  const company: Record<string, unknown> = { signals: [] };
  if (input.targetIndustries.length > 0)
    company['industries'] = { must_match_one: input.targetIndustries };
  if (input.targetSize.length > 0) company['size'] = { in: input.targetSize };
  if (input.targetGeographies.length > 0) company['geographies'] = { in: input.targetGeographies };
  if (input.targetRevenueMin !== undefined) company['annual_revenue_min'] = input.targetRevenueMin;
  const criteria: Record<string, unknown> = { company };
  if (input.shortDescription) criteria['notes'] = input.shortDescription;
  return criteria;
}
