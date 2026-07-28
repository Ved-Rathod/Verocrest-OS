import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import type { LeadScore, MatchSignal, ScoreExplainability, TopSignal } from './types';

const LEAD_SCORE_SELECT =
  'lead_id, fit_score, readiness_score, opportunity_score, icp_id, icp_match_score, icp_match_signals, rubric_version, score_version, top_signals, explainability, model, computed_at';

/** Read the current lead score (RLS member SELECT). Null when never scored. */
export async function getLeadScore(
  ctx: WorkspaceContext,
  leadId: string,
): Promise<LeadScore | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('lead_scores')
    .select(LEAD_SCORE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    leadId: data.lead_id as string,
    fitScore: data.fit_score as number,
    readinessScore: (data.readiness_score as number | null) ?? null,
    opportunityScore: (data.opportunity_score as number | null) ?? null,
    icpId: (data.icp_id as string | null) ?? null,
    icpMatchScore: (data.icp_match_score as number | null) ?? null,
    icpMatchSignals: (data.icp_match_signals as MatchSignal[] | null) ?? [],
    scoreVersion: data.score_version as number,
    rubricVersion: data.rubric_version as number,
    topSignals: (data.top_signals as TopSignal[]) ?? [],
    explainability: data.explainability as ScoreExplainability,
    model: data.model as string,
    computedAt: data.computed_at as string,
  };
}
