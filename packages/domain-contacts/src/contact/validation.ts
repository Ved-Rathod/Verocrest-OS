import { z } from 'zod';
import { SENIORITY_LEVELS } from './enums';

/**
 * Contact input validation (docs/10 §9.4 strict; docs/04 §4.1). A contact must
 * have at least a name or an email — an empty contact is meaningless.
 */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

export const contactInputSchema = z
  .object({
    firstName: optionalText(120),
    lastName: optionalText(120),
    primaryEmail: z.preprocess(
      emptyToUndefined,
      z.string().trim().toLowerCase().email('Email format is invalid').max(254).optional(),
    ),
    phone: optionalText(40),
    companyId: z.preprocess(emptyToUndefined, z.string().uuid('Invalid company').optional()),
    roleTitle: optionalText(120),
    seniority: z.preprocess(emptyToUndefined, z.enum(SENIORITY_LEVELS).optional()),
    isDecisionMaker: z
      .preprocess((v) => v === 'true' || v === true || v === 'on', z.boolean())
      .default(false),
    websiteUrl: z.preprocess(
      emptyToUndefined,
      z.string().url('Must be a valid URL (including https://)').max(2048).optional(),
    ),
    linkedinUrl: z.preprocess(
      emptyToUndefined,
      z.string().url('Must be a valid URL (including https://)').max(2048).optional(),
    ),
    notes: optionalText(10000),
    isClient: z
      .preprocess((v) => v === 'true' || v === true || v === 'on', z.boolean())
      .default(false),
    tags: z.array(z.string().trim().min(1).max(40)).max(50, 'At most 50 tags').default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.firstName && !v.lastName && !v.primaryEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['firstName'],
        message: 'Enter a first name, last name, or email',
      });
    }
  });

export type ContactInput = z.infer<typeof contactInputSchema>;

export const contactListParamsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  isClient: z.enum(['all', 'clients', 'prospects']).default('all'),
  companyId: z.string().uuid().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(512).optional(),
});

export type ContactListParams = z.infer<typeof contactListParamsSchema>;
