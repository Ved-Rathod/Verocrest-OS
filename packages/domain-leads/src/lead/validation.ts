import { z } from 'zod';
import { LEAD_CURRENCIES, LEAD_PRIORITIES, LEAD_STATUSES, MANUAL_LEAD_STATUSES } from './enums';

/**
 * Lead input validation per amended docs/04 §5.1 + docs/10 §9.4 (strict).
 * Amendment 001 rule: currency is required whenever estimated_value is set
 * (money convention docs/04 §1.2).
 */
// Nullish-robust: FormData yields null for absent keys and '' for present-but-
// empty inputs; both must normalize to undefined so optional/coerce fields don't
// mis-fire (e.g. z.coerce.number() turning null into 0). Sprint 2.3 bugfix.
const emptyToUndefined = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;
const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

export const leadInputSchema = z
  .object({
    // Required contact (Amendment 001). null/'' → the required message; a valid
    // uuid passes. Preprocess so an absent OR empty hidden field both report
    // "A contact is required" consistently.
    contactId: z.preprocess(
      emptyToUndefined,
      z.string({ required_error: 'A contact is required' }).uuid('A contact is required'),
    ),
    status: z.enum(MANUAL_LEAD_STATUSES, {
      errorMap: () => ({ message: 'Choose a valid status' }),
    }),
    priority: z.preprocess(emptyToUndefined, z.enum(LEAD_PRIORITIES).optional()),
    source: optionalText(120),
    estimatedValue: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(0, 'Cannot be negative').max(1_000_000_000_000, 'Too large').optional(),
    ),
    currency: z.preprocess(emptyToUndefined, z.enum(LEAD_CURRENCIES).optional()),
    expectedCloseDate: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
        .refine((s) => !Number.isNaN(Date.parse(s)), 'Must be a valid date')
        .optional(),
    ),
    notes: optionalText(10000),
    disqualifiedReason: optionalText(500),
    tags: z.array(z.string().trim().min(1).max(40)).max(50, 'At most 50 tags').default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.estimatedValue !== undefined && !v.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currency'],
        message: 'Choose a currency for the estimated value',
      });
    }
  });

export type LeadInput = z.infer<typeof leadInputSchema>;

export const leadListParamsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.preprocess(emptyToUndefined, z.enum(LEAD_STATUSES).optional()),
  priority: z.preprocess(emptyToUndefined, z.enum(LEAD_PRIORITIES).optional()),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(512).optional(),
});

export type LeadListParams = z.infer<typeof leadListParamsSchema>;

export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '(root)';
    out[key] ??= issue.message;
  }
  return out;
}
