'use server';

import { revalidatePath } from 'next/cache';
import { createReminder } from '@verocrest/domain-reminders/server';
import { applyQueueCooldown } from '@verocrest/domain-outreach-queue/server';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, ok, type ActionResult } from '@verocrest/platform-tenancy';

/**
 * App-layer composition (Sprint 5.0, D3). Snooze/Complete on the Outreach Queue
 * are realized as a follow-up reminder (the system of record for follow-up state,
 * `domain-reminders`) PLUS a service-role queue cooldown (`domain-outreach-queue`)
 * that drops the item from the active queue until it elapses. The materialized
 * queue keeps no mutable status columns. Composed here (app layer) rather than
 * inside a domain package so neither domain imports the other.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function snoozeOrComplete(
  formData: FormData,
  opts: { defaultDays: number; note: string },
): Promise<ActionResult<{ leadId: string }>> {
  const leadId = formData.get('leadId');
  if (typeof leadId !== 'string' || leadId.length === 0) {
    return fail({
      code: 'VALIDATION_ERROR',
      category: 'validation',
      message: 'A valid lead is required.',
      retryable: false,
    });
  }
  const daysRaw = formData.get('days');
  const days = typeof daysRaw === 'string' && daysRaw ? Number(daysRaw) : opts.defaultDays;
  const until = new Date(Date.now() + (Number.isFinite(days) ? days : opts.defaultDays) * DAY_MS);

  try {
    const ctx = await requireWorkspaceContext();

    // Follow-up reminder (RLS member write) — the system of record for follow-up state.
    await createReminder(ctx, {
      entityType: 'lead',
      entityId: leadId,
      note: opts.note,
      dueAt: until.toISOString(),
    });

    // Service-role cooldown drops the item from the active queue until `until`.
    const applied = await applyQueueCooldown({ workspaceId: ctx.workspaceId, leadId, until });
    if (!applied) {
      return fail({
        code: 'NOT_FOUND',
        category: 'business',
        message: 'This lead is not in the queue.',
        retryable: false,
      });
    }

    revalidatePath('/queue');
    revalidatePath('/');
    return ok({ leadId });
  } catch (err) {
    if (err instanceof WorkspaceContextError) {
      return fail({
        code: 'WORKSPACE_NOT_MEMBER',
        category: 'authorization',
        message: 'Please sign in.',
        retryable: false,
      });
    }
    console.error('[queue] snooze/complete failed', err);
    return fail({
      code: 'INTERNAL',
      category: 'database',
      message: 'The action could not be completed. Try again.',
      retryable: true,
    });
  }
}

/** Snooze: defer the item + create a follow-up reminder for the same time. */
export async function snoozeQueueItemAction(
  _prev: ActionResult<{ leadId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ leadId: string }>> {
  return snoozeOrComplete(formData, {
    defaultDays: 3,
    note: 'Snoozed from the outreach queue — follow up.',
  });
}

/** Complete: mark the recommended action done → cooldown + follow-up reminder (docs/05 §8). */
export async function completeQueueItemAction(
  _prev: ActionResult<{ leadId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ leadId: string }>> {
  return snoozeOrComplete(formData, {
    defaultDays: 3,
    note: 'Outreach action completed — follow up if no reply.',
  });
}
