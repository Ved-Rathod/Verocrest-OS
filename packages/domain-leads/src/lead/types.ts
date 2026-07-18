import { z } from 'zod';
import { LEAD_PRIORITIES, LEAD_STATUSES, type LeadPriority, type LeadStatus } from './enums';

/**
 * Lead read shapes per amended docs/04 §5.1. Contact + company display fields
 * arrive via PostgREST FK embeds — the leads FKs are leads-schema-owned, so
 * resolving them read-only is within this module (Module 2 spans contacts +
 * leads per docs/06 §3.8); all writes to contacts/companies stay in
 * domain-contacts.
 */

const embeddedContactSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  primary_email: z.string().nullable(),
  company_name: z.string().nullable(),
});

const embeddedCompanySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    domain: z.string().nullable(),
  })
  .nullable();

// PostgREST may embed to-one relations as object or single-element array.
const toOne = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([schema, z.array(schema)]).transform((v) => (Array.isArray(v) ? (v[0] ?? null) : v));

export const LEAD_SELECT =
  'id, status, priority, source, estimated_value, currency, expected_close_date, tags, contact_id, company_id, created_at, updated_at, contact:contacts!inner(id, first_name, last_name, primary_email, company_name), company:companies(id, name, domain)';

export const LEAD_DETAIL_SELECT =
  'id, status, priority, source, estimated_value, currency, expected_close_date, tags, notes, disqualified_reason, disqualified_at, first_ingested_at, contact_id, company_id, created_at, updated_at, contact:contacts!inner(id, first_name, last_name, primary_email, company_name), company:companies(id, name, domain)';

export const leadRowSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(LEAD_STATUSES),
  priority: z.enum(LEAD_PRIORITIES).nullable(),
  source: z.string().nullable(),
  estimated_value: z.coerce.number().nullable(),
  currency: z.string().nullable(),
  expected_close_date: z.string().nullable(),
  tags: z.array(z.string()),
  contact_id: z.string().uuid(),
  company_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  contact: toOne(embeddedContactSchema),
  company: toOne(embeddedCompanySchema).optional().nullable(),
});

export const leadDetailRowSchema = leadRowSchema.extend({
  notes: z.string().nullable(),
  disqualified_reason: z.string().nullable(),
  disqualified_at: z.string().nullable(),
  first_ingested_at: z.string(),
});

export type LeadContactRef = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  companyName: string | null;
};

export type LeadCompanyRef = { id: string; name: string; domain: string | null } | null;

export type Lead = {
  id: string;
  status: LeadStatus;
  priority: LeadPriority | null;
  source: string | null;
  estimatedValue: number | null;
  currency: string | null;
  expectedCloseDate: string | null;
  tags: string[];
  contactId: string;
  companyId: string | null;
  contact: LeadContactRef;
  company: LeadCompanyRef;
  createdAt: string;
  updatedAt: string;
};

export type LeadDetail = Lead & {
  notes: string | null;
  disqualifiedReason: string | null;
  disqualifiedAt: string | null;
  firstIngestedAt: string;
};

export function leadContactName(c: LeadContactRef): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || c.primaryEmail || 'Unnamed contact';
}

export function toLead(row: z.infer<typeof leadRowSchema>): Lead {
  const contact = row.contact;
  if (!contact) throw new Error('lead row missing required contact embed');
  return {
    id: row.id,
    status: row.status,
    priority: row.priority,
    source: row.source,
    estimatedValue: row.estimated_value,
    currency: row.currency,
    expectedCloseDate: row.expected_close_date,
    tags: row.tags,
    contactId: row.contact_id,
    companyId: row.company_id,
    contact: {
      id: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      primaryEmail: contact.primary_email,
      companyName: contact.company_name,
    },
    company: row.company
      ? { id: row.company.id, name: row.company.name, domain: row.company.domain }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toLeadDetail(row: z.infer<typeof leadDetailRowSchema>): LeadDetail {
  return {
    ...toLead(row),
    notes: row.notes,
    disqualifiedReason: row.disqualified_reason,
    disqualifiedAt: row.disqualified_at,
    firstIngestedAt: row.first_ingested_at,
  };
}

export type LeadPage = {
  items: Lead[];
  nextCursor: string | null;
};
