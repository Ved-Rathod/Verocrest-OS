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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const COMPANY_SELECT =
  'id, name, domain, website_url, industry, size, employee_count, description, tags, is_client, created_at, updated_at';

/** List page returned by the service (docs/10 §6.1.1 shape). */
export type CompanyPage = {
  items: Company[];
  nextCursor: string | null;
};
