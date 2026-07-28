import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyFacts, ContactFacts, IcpFacts } from './icp-match';

/**
 * Reads the facts the deterministic engine scores on, under the SERVICE ROLE
 * (the LIE write-locked path). Callers authorize workspace membership before
 * invoking; every read is still explicitly scoped to `workspace_id`.
 */

export type GatheredFacts = {
  leadId: string;
  contactId: string | null;
  companyId: string | null;
  company: CompanyFacts;
  contact: ContactFacts;
  icps: IcpFacts[];
  audit: { id: string; grade: number | null; summary: string; url: string | null } | null;
};

function countryOf(location: unknown): string | null {
  const l = location as { country?: unknown; country_code?: unknown } | null;
  if (l && typeof l.country_code === 'string') return l.country_code;
  if (l && typeof l.country === 'string') return l.country;
  return null;
}

export async function gatherFacts(
  supabase: SupabaseClient,
  workspaceId: string,
  leadId: string,
): Promise<GatheredFacts | null> {
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, contact_id, company_id')
    .eq('workspace_id', workspaceId)
    .eq('id', leadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) return null;

  const contactId = (lead.contact_id as string | null) ?? null;
  let companyId = (lead.company_id as string | null) ?? null;

  let contactFacts: ContactFacts = { seniority: null, isDecisionMaker: false };
  if (contactId) {
    const { data: contact, error } = await supabase
      .from('contacts')
      .select('seniority, is_decision_maker, company_id')
      .eq('workspace_id', workspaceId)
      .eq('id', contactId)
      .maybeSingle();
    if (error) throw error;
    if (contact) {
      contactFacts = {
        seniority: (contact.seniority as string | null) ?? null,
        isDecisionMaker: Boolean(contact.is_decision_maker),
      };
      companyId = companyId ?? (contact.company_id as string | null) ?? null;
    }
  }

  let companyFacts: CompanyFacts = { industry: null, size: null, country: null };
  if (companyId) {
    const { data: company, error } = await supabase
      .from('companies')
      .select('industry, size, location')
      .eq('workspace_id', workspaceId)
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (company) {
      companyFacts = {
        industry: (company.industry as string | null) ?? null,
        size: (company.size as string | null) ?? null,
        country: countryOf(company.location),
      };
    }
  }

  const { data: icpRows, error: icpError } = await supabase
    .from('icps')
    .select('id, name, target_industries, target_geographies, target_size, criteria, disqualifiers')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false });
  if (icpError) throw icpError;
  const icps: IcpFacts[] = (icpRows ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    targetIndustries: (r.target_industries as string[]) ?? [],
    targetGeographies: (r.target_geographies as string[]) ?? [],
    targetSize: (r.target_size as string[]) ?? [],
    criteria: r.criteria,
    disqualifiers: r.disqualifiers,
  }));

  // Latest completed audit for this lead's company (the website-intelligence signal).
  let audit: GatheredFacts['audit'] = null;
  if (companyId) {
    const { data: auditRow, error } = await supabase
      .from('audits')
      .select('id, overall_grade, url_normalized, signals')
      .eq('workspace_id', workspaceId)
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (auditRow) {
      const grade = (auditRow.overall_grade as number | null) ?? null;
      audit = {
        id: auditRow.id as string,
        grade,
        url: (auditRow.url_normalized as string | null) ?? null,
        summary:
          (auditRow.signals as { summary?: string } | null)?.summary ??
          `Website analysis grade ${grade ?? 'n/a'}/100.`,
      };
    }
  }

  return {
    leadId,
    contactId,
    companyId,
    company: companyFacts,
    contact: contactFacts,
    icps,
    audit,
  };
}
