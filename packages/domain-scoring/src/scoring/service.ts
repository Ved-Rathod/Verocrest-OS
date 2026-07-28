import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import { createServerRouter } from '@verocrest/platform-ai-router/server';
import type { MemoryScope, ScoreLeadOutput } from '@verocrest/platform-ai-router';
import { scoreLeadOutputSchema } from '@verocrest/platform-ai-router';
import { createSupabaseServiceRoleClient } from '@verocrest/platform-integrations/supabase/service';
import { SCORE_VERSION } from './version';
import { pickBestIcp } from './icp-match';
import { composeFit, composeOpportunity, type FitInput } from './compose';
import { gatherFacts } from './gather';
import type {
  FitComponent,
  LeadScore,
  ScoreExplainability,
  ScoreOutcome,
  TopSignal,
} from './types';

/**
 * Lead Scoring engine (Sprint 4.9, docs/04 §5.3–5.5, score_version 1). Runs under
 * the SERVICE ROLE — writing `lead_scores` / `lead_score_history` is the LIE
 * write-locked path (D5), exactly as the Knowledge Indexer writes `memory_vectors`.
 * Callers authorize workspace membership first (see the Server Action).
 *
 * Pipeline: gather RLS-scoped facts → deterministic ICP match + fit composition
 * (renormalized over AVAILABLE components; readiness/opportunity NULL until
 * Relationship Intelligence ships — D4) → `score-lead` capability for the
 * plain-language explainability (D2; degrades gracefully if the model is
 * unavailable) → atomic persist + emit `lead.scored`.
 */

const MEMORY_SCOPES: MemoryScope[] = ['contact', 'company', 'audit', 'icp'];

const READINESS_UNAVAILABLE =
  'Relationship Intelligence is not yet implemented (Sprint 7); readiness has no genuine inputs.';

type FitCompositionWeights = {
  icp_match_weight?: number;
  website_signal_weight?: number;
  enrichment_weight?: number;
};

function baseWeights(definition: unknown): Required<FitCompositionWeights> {
  const fc = (definition as { fit_composition?: FitCompositionWeights } | null)?.fit_composition;
  return {
    icp_match_weight: fc?.icp_match_weight ?? 0.6,
    website_signal_weight: fc?.website_signal_weight ?? 0.2,
    enrichment_weight: fc?.enrichment_weight ?? 0.2,
  };
}

export type ScoreLeadParams = {
  workspaceId: string;
  leadId: string;
  /** For AI usage attribution + RLS-scoped memory retrieval (the member). */
  actorUserId: string;
  computedByAgent?: string;
};

export async function scoreLeadNow(params: ScoreLeadParams): Promise<ScoreOutcome> {
  const { workspaceId, leadId, actorUserId } = params;
  const supabase = createSupabaseServiceRoleClient();

  const facts = await gatherFacts(supabase, workspaceId, leadId);
  if (!facts) return { status: 'lead_not_found' };

  // Active rubric (creates the default on first score) → weights + version.
  const { data: rubricJson, error: rubricError } = await supabase.rpc(
    'ensure_default_scoring_rubric',
    { p_workspace: workspaceId },
  );
  if (rubricError) throw rubricError;
  const rubric = rubricJson as { id: string; version: number; definition: unknown };
  const weights = baseWeights(rubric.definition);

  // ── Deterministic components (only what genuinely exists) ──────────────────
  const match = pickBestIcp(facts.company, facts.contact, facts.icps);
  const websiteGrade = facts.audit?.grade ?? null;

  const fitInputs: FitInput[] = [
    {
      key: 'icp',
      label: 'ICP match',
      available: match !== null,
      rawScore: match?.score ?? null,
      baseWeight: weights.icp_match_weight,
      note:
        match !== null
          ? `Best match: ${match.icpName} (${match.score}/100).`
          : 'No active ICP configured (pre-ICP fallback).',
    },
    {
      key: 'website',
      label: 'Website intelligence',
      available: websiteGrade !== null,
      rawScore: websiteGrade,
      baseWeight: weights.website_signal_weight,
      note:
        websiteGrade !== null
          ? `Latest website analysis grade ${websiteGrade}/100.`
          : 'No completed website analysis for this company.',
    },
    {
      key: 'enrichment',
      label: 'Enrichment',
      available: false,
      rawScore: null,
      baseWeight: weights.enrichment_weight,
      note: 'Enrichment substrate is not yet implemented (Sprint 7).',
    },
  ];

  const { fitScore, components } = composeFit(fitInputs);
  if (fitScore === null) {
    return {
      status: 'insufficient_signals',
      reason:
        'No scoring signals available. Configure an active ICP or run a website analysis for this lead.',
    };
  }

  // Readiness + opportunity: genuinely absent in v1 → NULL, never fabricated.
  const readinessScore: number | null = null;
  const opportunityScore = composeOpportunity(fitScore, readinessScore);

  // ── Explainability layer via the Router (D2). Degrades if unavailable. ─────
  const ai = await runExplainability({
    workspaceId,
    actorUserId,
    fitScore,
    match,
    facts,
    components,
  });

  const topSignals: TopSignal[] = ai?.signals ?? deterministicTopSignals(components, match);
  const explainability: ScoreExplainability = {
    scoreVersion: SCORE_VERSION,
    fit: { score: fitScore, components },
    readiness: { available: false, reason: READINESS_UNAVAILABLE },
    opportunity: { available: false, reason: 'Requires a genuine readiness score.' },
    narrative: ai?.summary ?? deterministicNarrative(fitScore, match, websiteGrade),
    aiAvailable: ai !== null,
    aiConfidence: ai?.confidence ?? null,
  };

  const model = ai?.model ?? 'deterministic';

  // ── Atomic persist (upsert score + append history) + emit lead.scored ──────
  const event = buildEvent({
    name: 'lead.scored',
    workspaceId,
    actor: { type: 'system', id: params.computedByAgent ?? 'lead-scorer' },
    subjectId: leadId,
    payload: {
      lead_id: leadId,
      fit_score: fitScore,
      opportunity_score: opportunityScore,
      score_version: SCORE_VERSION,
      model,
    },
  });

  const { data: scoreJson, error: persistError } = await supabase.rpc('score_lead_with_event', {
    p_score: {
      workspace_id: workspaceId,
      lead_id: leadId,
      fit_score: fitScore,
      readiness_score: readinessScore,
      opportunity_score: opportunityScore,
      icp_id: match?.icpId ?? null,
      icp_match_score: match?.score ?? null,
      icp_match_signals: match?.signals ?? null,
      rubric_id: rubric.id,
      rubric_version: rubric.version,
      score_version: SCORE_VERSION,
      top_signals: topSignals,
      explainability,
      model,
      computed_by_agent: params.computedByAgent ?? 'lead-scorer',
    },
    p_event: journalRowFromEnvelope(event),
  });
  if (persistError) throw persistError;

  await publishToBus(event);

  const row = scoreJson as Record<string, unknown>;
  const score: LeadScore = {
    leadId,
    fitScore,
    readinessScore,
    opportunityScore,
    icpId: match?.icpId ?? null,
    icpMatchScore: match?.score ?? null,
    icpMatchSignals: match?.signals ?? [],
    scoreVersion: SCORE_VERSION,
    rubricVersion: rubric.version,
    topSignals,
    explainability,
    model,
    computedAt: (row['computed_at'] as string) ?? new Date().toISOString(),
  };
  return { status: 'scored', score };
}

type ExplainabilityInput = {
  workspaceId: string;
  actorUserId: string;
  fitScore: number;
  match: ReturnType<typeof pickBestIcp>;
  facts: NonNullable<Awaited<ReturnType<typeof gatherFacts>>>;
  components: FitComponent[];
};

async function runExplainability(
  input: ExplainabilityInput,
): Promise<(ScoreLeadOutput & { model: string }) | null> {
  try {
    const router = createServerRouter();
    const requestId = crypto.randomUUID();
    const { output, metadata } = await router.callCapability<ScoreLeadOutput>({
      capability: 'score-lead',
      input: {
        fit_score: String(input.fitScore),
        icp_match:
          input.match !== null
            ? `${input.match.icpName}: ${input.match.score}/100`
            : 'No active ICP (pre-ICP fallback).',
        website: input.facts.audit?.summary ?? 'No website analysis available.',
        industry: input.facts.company.industry ?? 'unknown',
        components: input.components
          .map((c) => `- ${c.label}: ${c.available ? `${c.rawScore}/100` : 'unavailable'}`)
          .join('\n'),
      },
      workspaceContext: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        agentId: null,
        requestId,
      },
      memory: {
        scopes: MEMORY_SCOPES,
        subjectIds: [input.facts.contactId, input.facts.companyId].filter(
          (v): v is string => typeof v === 'string',
        ),
        topK: 6,
      },
    });
    const parsed = scoreLeadOutputSchema.safeParse(output);
    if (!parsed.success) return null;
    return { ...parsed.data, model: metadata.model };
  } catch (err) {
    // F-SCORE-002: the deterministic score still stands; explainability degrades.
    console.warn(
      `[scoring] score-lead explainability unavailable for lead ${input.facts.leadId}`,
      err,
    );
    return null;
  }
}

function deterministicTopSignals(
  components: FitComponent[],
  match: ReturnType<typeof pickBestIcp>,
): TopSignal[] {
  const signals: TopSignal[] = components
    .filter((c) => c.available)
    .map((c) => ({
      label: c.label,
      detail: c.note,
      direction: 'positive' as const,
    }));
  if (match) {
    for (const s of match.signals) {
      signals.push({
        label: `ICP · ${s.label}`,
        detail: s.detail,
        direction: s.hit ? 'positive' : 'negative',
      });
    }
  }
  signals.push({
    label: 'Readiness',
    detail: READINESS_UNAVAILABLE,
    direction: 'neutral',
  });
  return signals;
}

function deterministicNarrative(
  fitScore: number,
  match: ReturnType<typeof pickBestIcp>,
  websiteGrade: number | null,
): string {
  const parts = [`Fit score ${fitScore}/100.`];
  if (match) parts.push(`Best ICP match ${match.icpName} at ${match.score}/100.`);
  else parts.push('Scored without an active ICP (pre-ICP fallback).');
  if (websiteGrade !== null) parts.push(`Website intelligence grade ${websiteGrade}/100.`);
  parts.push('Readiness and opportunity await Relationship Intelligence (Sprint 7).');
  return parts.join(' ');
}
