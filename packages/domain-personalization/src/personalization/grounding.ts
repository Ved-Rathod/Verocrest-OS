import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';

/**
 * Grounding-context assembler (Milestone M4, D5). Reads the RLS-scoped facts the
 * personalization engine grounds on — company, contact, active ICP, active offers,
 * latest website analysis — and builds the prompt template variables + the memory
 * subject ids. Reads are direct (no cross-domain package coupling); AI Memory
 * retrieval (scopes icp/offer/audit/knowledge_doc/company/contact/workspace) adds
 * the deeper substrate at call time. Independent of Lead Scoring / the Queue (D5).
 */

export type GroundingContext = {
  contactId: string;
  companyId: string | null;
  templateVars: Record<string, string>;
  memorySubjectIds: string[];
  icpId: string | null;
  offerIds: string[];
  auditId: string | null;
};

export class ContactNotFoundError extends Error {
  constructor() {
    super('contact_not_found');
    this.name = 'ContactNotFoundError';
  }
}

export async function assembleGroundingContext(
  ctx: WorkspaceContext,
  contactId: string,
): Promise<GroundingContext> {
  const supabase = await createSupabaseServerClient();

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select(
      'id, first_name, last_name, role_title, company_id, company_name, company:companies(id, name, domain, website_url, industry)',
    )
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', contactId)
    .is('deleted_at', null)
    .maybeSingle();
  if (contactError) throw contactError;
  if (!contact) throw new ContactNotFoundError();

  const company = (contact.company ?? null) as {
    id?: string;
    name?: string;
    domain?: string | null;
    website_url?: string | null;
    industry?: string | null;
  } | null;

  const [icpRes, offersRes, auditRes] = await Promise.all([
    supabase
      .from('icps')
      .select('id, name, narrative')
      .eq('workspace_id', ctx.workspaceId)
      .eq('active', true)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('offers')
      .select('id, name, short_description, positioning')
      .eq('workspace_id', ctx.workspaceId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(5),
    supabase
      .from('audits')
      .select('id, url_normalized, overall_grade, signals')
      .eq('workspace_id', ctx.workspaceId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (icpRes.error) throw icpRes.error;
  if (offersRes.error) throw offersRes.error;
  if (auditRes.error) throw auditRes.error;

  const contactName =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || 'the contact';
  const role = (contact.role_title as string | null) ?? null;
  const companyName = company?.name ?? (contact.company_name as string | null) ?? 'the company';
  const website = company?.website_url ?? company?.domain ?? 'unknown';

  const icp = icpRes.data;
  const offers = offersRes.data ?? [];
  const audit = auditRes.data;
  const auditSummary =
    (audit?.signals as { summary?: string } | null)?.summary ??
    (audit
      ? `Latest website analysis grade ${audit.overall_grade ?? 'n/a'}/100 for ${audit.url_normalized}.`
      : 'No website analysis available.');

  return {
    contactId,
    companyId: company?.id ?? (contact.company_id as string | null) ?? null,
    icpId: (icp?.id as string | undefined) ?? null,
    offerIds: offers.map((o) => o.id as string),
    auditId: (audit?.id as string | undefined) ?? null,
    memorySubjectIds: [contactId, company?.id ?? (contact.company_id as string | null)].filter(
      (v): v is string => typeof v === 'string',
    ),
    templateVars: {
      company: companyName,
      contact: role ? `${contactName}, ${role}` : contactName,
      industry: company?.industry ?? 'unknown',
      website,
      icp: icp ? `${icp.name}: ${icp.narrative}` : 'No ICP configured.',
      offers:
        offers.length > 0
          ? offers
              .map((o) => `- ${o.name}: ${o.short_description ?? o.positioning ?? ''}`.trim())
              .join('\n')
          : 'No offers configured.',
      website_analysis: auditSummary,
    },
  };
}
