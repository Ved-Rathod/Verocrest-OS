import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import type { OnboardingItem, OnboardingProgress } from './types';

/**
 * Onboarding progress (docs/05 §3). Completion is derived from presence-probes,
 * so the checklist auto-detects finished steps and resumes after interruption
 * with zero stored per-item state. Reuses the existing feature surfaces — the
 * item CTAs deep-link to them; no forms are duplicated here.
 */

/** Raw completion signals gathered from RLS-scoped count probes. */
export type OnboardingSignals = {
  googleConnected: boolean;
  companyCount: number;
  activeIcp: boolean;
  activeOffer: boolean;
  knowledgeDocCount: number;
  knowledgeDocTypeCount: number;
  leadCount: number;
};

/**
 * Assemble the checklist from raw signals + persisted flags. Pure (no I/O) so the
 * completion rules are unit-testable. Item order follows docs/05 §3 with "Create
 * first Company" inserted (Sprint 4.6 approval) and the two unbuilt steps shown
 * as non-blocking `coming_soon` (Amendment 007).
 */
export function buildOnboardingProgress(
  signals: OnboardingSignals,
  state: { dismissed: boolean; onboardedAt: string | null },
): OnboardingProgress {
  const items: OnboardingItem[] = [
    {
      key: 'google',
      title: 'Connect Google',
      description: 'Link a Google account to this workspace.',
      href: '/settings/integrations',
      cta: 'Connect Google',
      status: signals.googleConnected ? 'done' : 'not_started',
      required: true,
    },
    {
      key: 'company',
      title: 'Create your first Company',
      description: 'Add a company to anchor your contacts and leads.',
      href: '/companies/new',
      cta: 'Add Company',
      status: signals.companyCount > 0 ? 'done' : 'not_started',
      required: true,
    },
    {
      key: 'icp',
      title: 'Configure your first ICP',
      description: 'Describe who you sell to — this feeds AI Memory.',
      href: '/settings/icps/new',
      cta: 'Configure ICP',
      status: signals.activeIcp ? 'done' : 'not_started',
      required: true,
    },
    {
      key: 'offer',
      title: 'Add your first Offer',
      description: 'Define what you sell, with pricing and positioning.',
      href: '/settings/offers/new',
      cta: 'Add Offer',
      status: signals.activeOffer ? 'done' : 'not_started',
      required: true,
    },
    {
      key: 'knowledge',
      title: 'Upload core Knowledge Documents',
      description: 'At least 3 documents across 2 types (SOP, case study, testimonial…).',
      href: '/kb/new',
      cta: 'Add Knowledge',
      status:
        signals.knowledgeDocCount >= 3 && signals.knowledgeDocTypeCount >= 2
          ? 'done'
          : 'not_started',
      required: true,
    },
    {
      key: 'leads',
      title: 'Import your first leads',
      description: 'Add a lead to start the intelligence flow.',
      href: '/leads',
      cta: 'Add Leads',
      status: signals.leadCount > 0 ? 'done' : 'not_started',
      required: true,
    },
    {
      key: 'revenue_target',
      title: 'Set your Revenue Target',
      description: 'Monthly and quarterly targets. Available in a later setup step.',
      href: null,
      cta: 'Coming soon',
      status: 'coming_soon',
      required: false,
    },
    {
      key: 'website_audit',
      title: 'Run your first Website Audit',
      description: 'Audit a lead’s website. Available in a later setup step.',
      href: null,
      cta: 'Coming soon',
      status: 'coming_soon',
      required: false,
    },
  ];

  const required = items.filter((i) => i.required);
  const requiredDone = required.filter((i) => i.status === 'done').length;

  return {
    items,
    requiredTotal: required.length,
    requiredDone,
    complete: requiredDone === required.length,
    dismissed: state.dismissed,
    onboardedAt: state.onboardedAt,
  };
}

async function gatherSignals(
  ctx: WorkspaceContext,
): Promise<{ signals: OnboardingSignals; dismissed: boolean; onboardedAt: string | null }> {
  const supabase = await createSupabaseServerClient();
  const ws = ctx.workspaceId;
  const count = { head: true, count: 'exact' as const };

  const [google, company, icp, offer, leads, kbTypes, workspace] = await Promise.all([
    supabase
      .from('integration_connections')
      .select('id', count)
      .eq('workspace_id', ws)
      .eq('provider', 'google')
      .eq('status', 'active'),
    supabase.from('companies').select('id', count).eq('workspace_id', ws).is('deleted_at', null),
    supabase
      .from('icps')
      .select('id', count)
      .eq('workspace_id', ws)
      .eq('active', true)
      .is('deleted_at', null),
    supabase
      .from('offers')
      .select('id', count)
      .eq('workspace_id', ws)
      .eq('status', 'active')
      .is('deleted_at', null),
    supabase.from('leads').select('id', count).eq('workspace_id', ws).is('deleted_at', null),
    supabase
      .from('knowledge_documents')
      .select('doc_type')
      .eq('workspace_id', ws)
      .is('deleted_at', null)
      .limit(50),
    supabase
      .from('workspaces')
      .select('onboarded_at, onboarding_dismissed_at')
      .eq('id', ws)
      .maybeSingle(),
  ]);

  for (const r of [google, company, icp, offer, leads, kbTypes, workspace]) {
    if (r.error) throw r.error;
  }

  const docTypes = (kbTypes.data ?? []).map((r) => r.doc_type as string);
  const signals: OnboardingSignals = {
    googleConnected: (google.count ?? 0) > 0,
    companyCount: company.count ?? 0,
    activeIcp: (icp.count ?? 0) > 0,
    activeOffer: (offer.count ?? 0) > 0,
    knowledgeDocCount: docTypes.length,
    knowledgeDocTypeCount: new Set(docTypes).size,
    leadCount: leads.count ?? 0,
  };
  const wsRow = workspace.data as {
    onboarded_at: string | null;
    onboarding_dismissed_at: string | null;
  } | null;
  return {
    signals,
    dismissed: Boolean(wsRow?.onboarding_dismissed_at),
    onboardedAt: wsRow?.onboarded_at ?? null,
  };
}

export async function getOnboardingProgress(ctx: WorkspaceContext): Promise<OnboardingProgress> {
  const { signals, dismissed, onboardedAt } = await gatherSignals(ctx);
  return buildOnboardingProgress(signals, { dismissed, onboardedAt });
}

/**
 * Stamp the workspace onboarded + emit `workspace.onboarded` exactly once
 * (docs/05 §3.9). The RPC guards on `onboarded_at is null`, so a concurrent or
 * repeat call is a no-op. Returns true only when this call fired the event.
 */
export async function markWorkspaceOnboarded(
  ctx: WorkspaceContext,
  completedSteps: number,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const event = buildEvent({
    name: 'workspace.onboarded',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: ctx.workspaceId,
    payload: { completed_steps: completedSteps },
  });
  const { data, error } = await supabase.rpc('mark_workspace_onboarded_with_event', {
    p_workspace: ctx.workspaceId,
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  if (!data) return false; // already onboarded — no duplicate event
  await publishToBus(event);
  return true;
}

/** Dismiss the checklist takeover (docs/05 §3): never blocks navigation afterward. */
export async function dismissOnboarding(ctx: WorkspaceContext): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('workspaces')
    .update({ onboarding_dismissed_at: new Date().toISOString() })
    .eq('id', ctx.workspaceId);
  if (error) throw error;
}
