import { z } from 'zod';
import { SENIORITY_LEVELS, type Seniority } from './enums';

/** A phone entry in the contacts.phones jsonb array (docs/04 §4.1). */
export const phoneEntrySchema = z.object({
  label: z.string().optional(),
  number: z.string(),
});
export type PhoneEntry = z.infer<typeof phoneEntrySchema>;

/** Lenient parse of the phones jsonb (tolerates legacy/odd shapes). */
const phonesSchema = z.array(phoneEntrySchema).catch([]);

export const CONTACT_SELECT =
  'id, first_name, last_name, primary_email, company_id, company_name, role_title, seniority, is_decision_maker, is_client, tags, created_at, updated_at';

export const CONTACT_DETAIL_SELECT =
  'id, first_name, last_name, primary_email, phones, company_id, company_name, role_title, seniority, is_decision_maker, website_url, linkedin_url, notes, is_client, tags, created_at, updated_at, company:companies(id, name, domain, industry)';

export const contactRowSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  primary_email: z.string().nullable(),
  company_id: z.string().uuid().nullable(),
  company_name: z.string().nullable(),
  role_title: z.string().nullable(),
  seniority: z.enum(SENIORITY_LEVELS).nullable().catch(null),
  is_decision_maker: z.boolean(),
  is_client: z.boolean(),
  tags: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

const linkedCompanySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    domain: z.string().nullable(),
    industry: z.string().nullable(),
  })
  .nullable();

export const contactDetailRowSchema = contactRowSchema.extend({
  phones: phonesSchema,
  website_url: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  notes: z.string().nullable(),
  // supabase embeds a to-one relation as an object (or null); tolerate an array too.
  company: z.union([linkedCompanySchema, z.array(linkedCompanySchema)]).optional(),
});

export type LinkedCompany = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
};

export type Contact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  companyId: string | null;
  companyName: string | null;
  roleTitle: string | null;
  seniority: Seniority | null;
  isDecisionMaker: boolean;
  isClient: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ContactDetail = Contact & {
  phones: PhoneEntry[];
  websiteUrl: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  company: LinkedCompany | null;
};

export function displayName(c: Pick<Contact, 'firstName' | 'lastName' | 'primaryEmail'>): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || c.primaryEmail || 'Unnamed contact';
}

export function toContact(row: z.infer<typeof contactRowSchema>): Contact {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    primaryEmail: row.primary_email,
    companyId: row.company_id,
    companyName: row.company_name,
    roleTitle: row.role_title,
    seniority: row.seniority,
    isDecisionMaker: row.is_decision_maker,
    isClient: row.is_client,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toContactDetail(row: z.infer<typeof contactDetailRowSchema>): ContactDetail {
  const base = toContact(contactRowSchema.parse(row));
  const companyRaw = Array.isArray(row.company) ? (row.company[0] ?? null) : (row.company ?? null);
  return {
    ...base,
    phones: row.phones,
    websiteUrl: row.website_url,
    linkedinUrl: row.linkedin_url,
    notes: row.notes,
    company: companyRaw,
  };
}

export type ContactPage = {
  items: Contact[];
  nextCursor: string | null;
};
