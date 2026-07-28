import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Reads the facts the queue recompute needs, under the SERVICE ROLE (the LIE
 * write-locked path). Callers authorize workspace membership first; every read is
 * still explicitly scoped to `workspace_id`.
 */

export type OfferCandidate = { id: string; name: string; summary: string };

export type QueueFacts = {
  leadId: string;
  contactId: string | null;
  companyId: string | null;
  leadDisqualified: boolean;
  fitScore: number | null;
  opportunityScore: number | null;
  cooldownUntil: string | null;
  isNew: boolean;
  contactName: string;
  companyName: string | null;
  industry: string | null;
  websiteSummary: string;
  icpNarrative: string | null;
  offers: OfferCandidate[];
};

export async function gatherQueueFacts(
  supabase: SupabaseClient,
  workspaceId: string,
  leadId: string,
): Promise<QueueFacts | null> {
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, contact_id, company_id, status')
    .eq('workspace_id', workspaceId)
    .eq('id', leadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) return null;

  const contactId = (lead.contact_id as string | null) ?? null;
  let companyId = (lead.company_id as string | null) ?? null;

  const { data: score, error: scoreError } = await supabase
    .from('lead_scores')
    .select('fit_score, opportunity_score')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (scoreError) throw scoreError;

  const { data: existing, error: existingError } = await supabase
    .from('outreach_queue_items')
    .select('cooldown_until')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (existingError) throw existingError;

  let contactName = 'the contact';
  if (contactId) {
    const { data: contact, error } = await supabase
      .from('contacts')
      .select('first_name, last_name, company_id')
      .eq('workspace_id', workspaceId)
      .eq('id', contactId)
      .maybeSingle();
    if (error) throw error;
    if (contact) {
      contactName =
        [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || 'the contact';
      companyId = companyId ?? (contact.company_id as string | null) ?? null;
    }
  }

  let companyName: string | null = null;
  let industry: string | null = null;
  if (companyId) {
    const { data: company, error } = await supabase
      .from('companies')
      .select('name, industry')
      .eq('workspace_id', workspaceId)
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    companyName = (company?.name as string | null) ?? null;
    industry = (company?.industry as string | null) ?? null;
  }

  // Latest completed audit summary (grounding for recommend-offer).
  let websiteSummary = 'No website analysis available.';
  if (companyId) {
    const { data: audit, error } = await supabase
      .from('audits')
      .select('overall_grade, signals')
      .eq('workspace_id', workspaceId)
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (audit) {
      websiteSummary =
        (audit.signals as { summary?: string } | null)?.summary ??
        `Website analysis grade ${(audit.overall_grade as number | null) ?? 'n/a'}/100.`;
    }
  }

  const { data: icp, error: icpError } = await supabase
    .from('icps')
    .select('name, narrative')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (icpError) throw icpError;

  const { data: offerRows, error: offersError } = await supabase
    .from('offers')
    .select('id, name, short_description, positioning')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(5);
  if (offersError) throw offersError;

  return {
    leadId,
    contactId,
    companyId,
    leadDisqualified: (lead.status as string) === 'disqualified',
    fitScore: (score?.fit_score as number | null) ?? null,
    opportunityScore: (score?.opportunity_score as number | null) ?? null,
    cooldownUntil: (existing?.cooldown_until as string | null) ?? null,
    isNew: !existing,
    contactName,
    companyName,
    industry,
    websiteSummary,
    icpNarrative: icp ? `${icp.name}: ${icp.narrative}` : null,
    offers: (offerRows ?? []).map((o) => ({
      id: o.id as string,
      name: o.name as string,
      summary: (o.short_description as string | null) ?? (o.positioning as string | null) ?? '',
    })),
  };
}
