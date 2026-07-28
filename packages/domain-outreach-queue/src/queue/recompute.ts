import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import { createServerRouter } from '@verocrest/platform-ai-router/server';
import type { MemoryScope, RecommendOfferOutput } from '@verocrest/platform-ai-router';
import { recommendOfferOutputSchema } from '@verocrest/platform-ai-router';
import { createSupabaseServiceRoleClient } from '@verocrest/platform-integrations/supabase/service';
import { gatherQueueFacts, type OfferCandidate, type QueueFacts } from './gather';
import { decideNextBestAction, effectivePriority, QUEUE_VERSION } from './nba';
import type { QueueItem, QueueReasoning, RecomputeOutcome } from './types';

/**
 * Outreach Queue recompute (Sprint 5.0, docs/04 §8.1, docs/03 §6.5). Runs under
 * the SERVICE ROLE — the queue is a write-locked materialized projection (D5).
 * Gather facts → deterministic NBA → `recommend-offer` (structured, memory-grounded,
 * degrades gracefully) → D10 explainability → atomic upsert + workspace rerank +
 * emit `outreach.queue.updated`. Ranking uses a transient
 * `effective_priority = opportunity_score ?? fit_score` inside the RPC (Amendment 012).
 */

const MEMORY_SCOPES: MemoryScope[] = ['icp', 'offer', 'company', 'audit', 'knowledge_doc'];
const ITEM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type RecomputeParams = {
  workspaceId: string;
  leadId: string;
  /** For AI usage attribution + RLS-scoped memory retrieval (the member, when present). */
  actorUserId?: string;
};

export async function recomputeQueueForLead(params: RecomputeParams): Promise<RecomputeOutcome> {
  const { workspaceId, leadId } = params;
  const supabase = createSupabaseServiceRoleClient();

  const facts = await gatherQueueFacts(supabase, workspaceId, leadId);
  if (!facts) return { status: 'lead_not_found' };
  if (facts.fitScore === null || !facts.contactId) {
    return {
      status: 'not_scored',
      reason: 'Score this lead before it can enter the outreach queue.',
    };
  }

  const now = Date.now();
  const cooldownActive =
    facts.cooldownUntil !== null && new Date(facts.cooldownUntil).getTime() > now;

  // recommend-offer only when an outreach action is actually on the table.
  const offerRec =
    !cooldownActive && !facts.leadDisqualified && facts.offers.length > 0
      ? await runRecommendOffer(params, facts)
      : null;

  const nba = decideNextBestAction({
    fitScore: facts.fitScore,
    opportunityScore: facts.opportunityScore,
    leadDisqualified: facts.leadDisqualified,
    cooldownActive,
    hasRecommendedOffer: offerRec !== null,
  });

  const priority = effectivePriority(facts.fitScore, facts.opportunityScore);
  const reasoning: QueueReasoning = {
    version: QUEUE_VERSION,
    priority: {
      basis: priority.basis,
      value: priority.value,
      note:
        priority.basis === 'opportunity'
          ? `Ranked on opportunity score ${priority.value}/100.`
          : `Ranked on fit score ${priority.value}/100 (opportunity pending Relationship Intelligence).`,
    },
    nextBestAction: { action: nba.action, channel: nba.channel, reason: nba.reason },
    recommendedOffer: offerRec,
  };

  const expiresAt = new Date(now + ITEM_TTL_MS).toISOString();
  const event = buildEvent({
    name: 'outreach.queue.updated',
    workspaceId,
    actor: { type: 'system', id: 'outreach-queue' },
    subjectId: leadId,
    payload: { lead_id: leadId, added: facts.isNew ? 1 : 0, removed: 0, reordered: 1 },
  });

  const { data: itemJson, error } = await supabase.rpc('recompute_queue_item_with_event', {
    p_item: {
      workspace_id: workspaceId,
      lead_id: leadId,
      contact_id: facts.contactId,
      company_id: facts.companyId,
      recommended_offer_id: offerRec?.offerId ?? null,
      opportunity_score: facts.opportunityScore, // genuine value (nullable)
      next_best_action: nba.action,
      reasoning,
      channel_preference: nba.channel,
      cooldown_until: facts.cooldownUntil, // preserve an active snooze across recompute
      expires_at: expiresAt,
      priority_rank: 0, // RPC reranks the workspace
    },
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;

  await publishToBus(event);

  const row = itemJson as Record<string, unknown>;
  const item: QueueItem = {
    leadId,
    contactId: facts.contactId,
    companyId: facts.companyId,
    contactName: facts.contactName,
    companyName: facts.companyName,
    recommendedOfferId: offerRec?.offerId ?? null,
    recommendedOfferName: offerRec?.offerName ?? null,
    opportunityScore: facts.opportunityScore,
    nextBestAction: nba.action,
    channelPreference: nba.channel,
    reasoning,
    cooldownUntil: facts.cooldownUntil,
    priorityRank: (row['priority_rank'] as number) ?? 0,
    computedAt: (row['computed_at'] as string) ?? new Date().toISOString(),
    expiresAt,
  };
  return { status: 'queued', item };
}

async function runRecommendOffer(
  params: RecomputeParams,
  facts: QueueFacts,
): Promise<QueueReasoning['recommendedOffer']> {
  const numbered = facts.offers
    .map((o: OfferCandidate, i) => `${i + 1}. ${o.name}${o.summary ? ` — ${o.summary}` : ''}`)
    .join('\n');
  try {
    const router = createServerRouter();
    const { output, metadata } = await router.callCapability<RecommendOfferOutput>({
      capability: 'recommend-offer',
      input: {
        company: facts.companyName ?? 'the company',
        industry: facts.industry ?? 'unknown',
        icp: facts.icpNarrative ?? 'No ICP configured.',
        website: facts.websiteSummary,
        offers: numbered,
      },
      workspaceContext: {
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId ?? undefined,
        agentId: null,
        requestId: crypto.randomUUID(),
      },
      memory: {
        scopes: MEMORY_SCOPES,
        subjectIds: [facts.contactId, facts.companyId].filter(
          (v): v is string => typeof v === 'string',
        ),
        topK: 8,
      },
    });
    const parsed = recommendOfferOutputSchema.safeParse(output);
    if (!parsed.success) return null;
    const ref = parsed.data.offer_ref;
    if (ref < 1 || ref > facts.offers.length) return null; // 0 = "no offer fits"
    const chosen = facts.offers[ref - 1];
    if (!chosen) return null;
    return {
      offerId: chosen.id,
      offerName: chosen.name,
      rationale: parsed.data.rationale,
      confidence: parsed.data.confidence,
      aiAvailable: true,
    };
  } catch (err) {
    // Degrades gracefully: the queue item still ranks + carries an NBA without an offer.
    console.warn(`[outreach-queue] recommend-offer unavailable for lead ${facts.leadId}`, err);
    return null;
  }
}
