import { z } from 'zod';
import { TARGET_PERIODS } from './types';

/** Revenue Target validation (docs/04 §13.2, docs/05 §3.6, Sprint 4.7). */

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Use a valid date');

const isoCurrency = z
  .string()
  .trim()
  .length(3, 'Use a 3-letter ISO currency')
  .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter ISO currency')
  .transform((s) => s.toUpperCase());

export const targetInputSchema = z
  .object({
    period: z.enum(TARGET_PERIODS),
    periodStart: isoDate,
    periodEnd: isoDate,
    revenueTarget: z
      .number({ invalid_type_error: 'Enter a target amount' })
      .nonnegative('Target cannot be negative'),
    currency: isoCurrency,
    meetingsTarget: z.number().int().nonnegative('Cannot be negative').optional(),
    replyRateTarget: z.number().nonnegative('Cannot be negative').max(100, 'Max 100%').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.periodEnd <= v.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodEnd'],
        message: 'End date must be after the start date',
      });
    }
  });

export type TargetInput = z.infer<typeof targetInputSchema>;
