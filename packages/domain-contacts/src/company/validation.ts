import { z } from 'zod';
import { COMPANY_SIZES } from './enums';

/**
 * Company input validation (docs/10 §9.4 strict boundary; docs/04 §4.5
 * constraints). Empty optional strings normalize to undefined so blank form
 * fields don't persist as empty strings.
 */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

export const companyInputSchema = z
  .object({
    name: z
      .string({ required_error: 'Company name is required' })
      .trim()
      .min(1, 'Company name is required')
      .max(200, 'Must be at most 200 characters'),
    domain: optionalText(253),
    websiteUrl: z.preprocess(
      emptyToUndefined,
      z.string().url('Must be a valid URL (including https://)').max(2048).optional(),
    ),
    industry: optionalText(120),
    size: z.preprocess(emptyToUndefined, z.enum(COMPANY_SIZES).optional()),
    employeeCount: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.coerce
        .number()
        .int('Must be a whole number')
        .min(0, 'Cannot be negative')
        .max(10_000_000)
        .optional(),
    ),
    description: optionalText(5000),
    isClient: z
      .preprocess((v) => v === 'true' || v === true || v === 'on', z.boolean())
      .default(false),
    tags: z.array(z.string().trim().min(1).max(40)).max(50, 'At most 50 tags').default([]),
  })
  .strict();

export type CompanyInput = z.infer<typeof companyInputSchema>;

/** Parse a comma/newline separated tag string from a form field. */
export function parseTags(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 40),
    ),
  ).slice(0, 50);
}

/** List filters (docs/10 §6.1.1). Applied in the service; UI exposes a subset. */
export const companyListParamsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  isClient: z.enum(['all', 'clients', 'prospects']).default('all'),
  size: z.enum(COMPANY_SIZES).optional(),
  industry: z.string().trim().max(120).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(512).optional(),
});

export type CompanyListParams = z.infer<typeof companyListParamsSchema>;

export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '(root)';
    out[key] ??= issue.message;
  }
  return out;
}
