import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { buildEvent, journalRowFromEnvelope, publishToBus } from '@verocrest/platform-event-bus';
import { createServerRouter } from '@verocrest/platform-ai-router/server';
import type { MemoryScope, PersonalizationOutput } from '@verocrest/platform-ai-router';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import { assembleGroundingContext } from './grounding';
import { componentsToPreview } from './validation';
import {
  PERSONALIZATION_SELECT,
  outreachDraftRowSchema,
  toPersonalization,
  type Personalization,
} from './types';

/**
 * Personalization service (Milestone M4, docs/04 §9.1, docs/09 §11). Assembles
 * grounding, calls the Model Router's `generate-personalization` capability
 * (structured, memory-grounded — the ONLY AI entry point), persists the draft to
 * `outreach_messages` with citations via an atomic RPC, and emits
 * `outreach.draft.generated`. Consumes memory; does NOT re-index output (D7).
 */

const MEMORY_SCOPES: MemoryScope[] = [
  'contact',
  'company',
  'audit',
  'icp',
  'offer',
  'knowledge_doc',
  'workspace',
];

export async function generatePersonalization(
  ctx: WorkspaceContext,
  contactId: string,
): Promise<Personalization> {
  const grounding = await assembleGroundingContext(ctx, contactId);

  const router = createServerRouter();
  const requestId = crypto.randomUUID();
  const { output, metadata } = await router.callCapability<PersonalizationOutput>({
    capability: 'generate-personalization',
    input: grounding.templateVars,
    workspaceContext: {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      agentId: null,
      requestId,
    },
    memory: { scopes: MEMORY_SCOPES, subjectIds: grounding.memorySubjectIds, topK: 8 },
  });

  const citations = {
    memory_ids: metadata.memoryHits.map((h) => h.memoryId),
    icp_id: grounding.icpId,
    offer_ids: grounding.offerIds,
    audit_id: grounding.auditId,
  };
  const id = crypto.randomUUID();
  const event = buildEvent({
    name: 'outreach.draft.generated',
    workspaceId: ctx.workspaceId,
    actor: { type: 'user', id: ctx.userId },
    subjectId: id,
    payload: { channel: 'email', draft_id: id, model: metadata.model, citations },
  });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_outreach_draft_with_event', {
    p_message: {
      id,
      workspace_id: ctx.workspaceId,
      contact_id: contactId,
      company_id: grounding.companyId,
      offer_id: grounding.offerIds[0] ?? null,
      channel: 'email',
      direction: 'outbound',
      status: 'draft',
      body: componentsToPreview(output),
      model: metadata.model,
      prompt_id: metadata.promptId,
      prompt_version: metadata.promptVersion,
      citations,
      personalization: output,
      sender_user_id: ctx.userId,
      metadata: {},
    },
    p_event: journalRowFromEnvelope(event),
  });
  if (error) throw error;
  const personalization = toPersonalization(outreachDraftRowSchema.parse(data));
  await publishToBus(event);
  return personalization;
}

/** Personalization history for a contact, newest first (Milestone M4). */
export async function listPersonalizations(
  ctx: WorkspaceContext,
  contactId: string,
): Promise<Personalization[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('outreach_messages')
    .select(PERSONALIZATION_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('contact_id', contactId)
    .not('personalization', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => toPersonalization(outreachDraftRowSchema.parse(r)));
}
