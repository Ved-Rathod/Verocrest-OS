'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, ok, type ActionResult } from '@verocrest/platform-tenancy';
import { scoreLeadNow } from './scoring/service';
import type { LeadScore } from './scoring/types';

/**
 * Score-lead Server Action (Sprint 4.9). Authorizes the caller (workspace member)
 * and confirms the lead is visible under RLS, THEN delegates to the service-role
 * scoring engine (the LIE write-locked path). Auto-triggering off the lead/audit
 * event chain is a Sprint 7 item (roadmap S7 #6) — deferred per D1.
 */
export async function scoreLeadAction(
  _prev: ActionResult<{ score: LeadScore }> | null,
  formData: FormData,
): Promise<ActionResult<{ score: LeadScore }>> {
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

    // Authorize: the lead must be visible to this member under RLS.
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

    const outcome = await scoreLeadNow({
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
    if (outcome.status === 'insufficient_signals') {
      return fail({
        code: 'INSUFFICIENT_SIGNALS',
        category: 'business',
        message: outcome.reason,
        retryable: false,
      });
    }

    revalidatePath(`/leads/${leadId}`);
    return ok({ score: outcome.score });
  } catch (err) {
    if (err instanceof WorkspaceContextError) {
      return fail({
        code: 'WORKSPACE_NOT_MEMBER',
        category: 'authorization',
        message: 'Please sign in.',
        retryable: false,
      });
    }
    console.error('[scoring] scoreLeadAction failed', err);
    return fail({
      code: 'INTERNAL',
      category: 'ai',
      message: 'Lead could not be scored. Try again.',
      retryable: true,
    });
  }
}
