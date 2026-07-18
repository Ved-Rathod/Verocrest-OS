import { z } from 'zod';
import { COMPANY_SIZES, type CompanySize } from './enums';

/** Columns selected for company reads (docs/04 §4.5 subset used in v0.1). */
export const companyRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  domain: z.string().nullable(),
  website_url: z.string().nullable(),
  industry: z.string().nullable(),
  size: z.enum(COMPANY_SIZES).nullable(),
  employee_count: z.number().int().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  is_client: z.boolean(),
  custom_fields: z.record(z.string(), z.unknown()).catch({}),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Company = {
  id: string;
  name: string;
  domain: string | null;
  websiteUrl: string | null;
  industry: string | null;
  size: CompanySize | null;
  employeeCount: number | null;
  description: string | null;
  tags: string[];
  isClient: boolean;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function toCompany(row: z.infer<typeof companyRowSchema>): Company {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    websiteUrl: row.website_url,
    industry: row.industry,
    size: row.size,
    employeeCount: row.employee_count,
    description: row.description,
    tags: row.tags,
    isClient: row.is_client,
    customFields: row.custom_fields,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const COMPANY_SELECT =
  'id, name, domain, website_url, industry, size, employee_count, description, tags, is_client, custom_fields, created_at, updated_at';

/** List page returned by the service (docs/10 §6.1.1 shape). */
export type CompanyPage = {
  items: Company[];
  nextCursor: string | null;
};

/**
 * Company detail (docs/10 §6.1.3). `counts` in v0.1 is contacts only — deals and
 * audits land in Sprints 10/8, so those are surfaced as gated placeholders in the
 * UI rather than real counts.
 */
export type CompanyDetail = Company & {
  contactCount: number;
  /** Per-request viewer flag — drives owner-only Merge visibility (docs/10 §6.1.7). */
  viewerIsOwner: boolean;
};

/** A contact shown under "Contacts at this company" on the detail page. */
export type CompanyContactRef = {
  id: string;
  name: string;
  email: string | null;
  roleTitle: string | null;
  isDecisionMaker: boolean;
};

export function contactRefName(
  first: string | null,
  last: string | null,
  email: string | null,
): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || email || 'Unnamed contact';
}
