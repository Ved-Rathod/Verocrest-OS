'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, ok, type ActionResult } from '@verocrest/platform-tenancy';
import { recomputeQueueForLead } from './queue/recompute';
import type { QueueItem } from './queue/types';

/**
 * "Recalculate priority" Server Action (Sprint 5.0, D6). Authorizes the caller
 * (workspace member, lead visible under RLS), then delegates to the service-role
 * recompute (the write-locked queue path). Automatic refresh on `lead.scored` is
 * wired separately via the event consumer.
 */
export async function recalculateQueueItemAction(
  _prev: ActionResult<{ item: QueueItem }> | null,
  formData: FormData,
): Promise<ActionResult<{ item: QueueItem }>> {
  const leadId = formData.get('leadId');
  if (typeof leadId !== 'string' || leadId.length === 0) {
    return fail({
      code: 'VALIDATION_ERROR',
      category: 'validation',
      message: 'A valid lead is required.',
      retryable: false,
    });
  }

  try {
    const ctx = await requireWorkspaceContext();

    const supabase = await createSupabaseServerClient();
    const { data: lead, error } = await supabase
      .from('leads')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', leadId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!lead) {
      return fail({
        code: 'NOT_FOUND',
        category: 'business',
        message: 'Lead not found.',
        retryable: false,
      });
    }

    const outcome = await recomputeQueueForLead({
      workspaceId: ctx.workspaceId,
      leadId,
      actorUserId: ctx.userId,
    });

    if (outcome.status === 'lead_not_found') {
      return fail({
        code: 'NOT_FOUND',
        category: 'business',
        message: 'Lead not found.',
        retryable: false,
      });
    }
    if (outcome.status === 'not_scored') {
      return fail({
        code: 'NOT_SCORED',
        category: 'business',
        message: outcome.reason,
        retryable: false,
      });
    }

    revalidatePath('/queue');
    revalidatePath(`/leads/${leadId}`);
    return ok({ item: outcome.item });
  } catch (err) {
    if (err instanceof WorkspaceContextError) {
      return fail({
        code: 'WORKSPACE_NOT_MEMBER',
        category: 'authorization',
        message: 'Please sign in.',
        retryable: false,
      });
    }
    console.error('[outreach-queue] recalculate failed', err);
    return fail({
      code: 'INTERNAL',
      category: 'ai',
      message: 'The queue could not be recalculated. Try again.',
      retryable: true,
    });
  }
}
