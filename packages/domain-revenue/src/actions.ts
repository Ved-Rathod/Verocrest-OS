'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { z } from 'zod';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, type ActionResult } from '@verocrest/platform-tenancy';
import { createTarget, updateTarget, deleteTarget } from './target/service';
import type { Target } from './target/types';
import { targetInputSchema } from './target/validation';

/**
 * Revenue Target Server Actions (docs/05 §3.6, docs/10 §3.1). Validate, delegate
 * to the service (which emits `target.set`), revalidate, and redirect.
 */

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function inputFromFormData(formData: FormData): unknown {
  return {
    period: formData.get('period'),
    periodStart: formData.get('periodStart'),
    periodEnd: formData.get('periodEnd'),
    revenueTarget: optionalNumber(formData.get('revenueTarget')),
    currency: formData.get('currency'),
    meetingsTarget: optionalNumber(formData.get('meetingsTarget')),
    replyRateTarget: optionalNumber(formData.get('replyRateTarget')),
  };
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    out[key] ??= issue.message;
  }
  return out;
}

const targetErrors = {
  validation: (fieldErrorsMap: Record<string, string>) =>
    fail<{ target: Target }>({
      code: 'VALIDATION_ERROR',
      category: 'validation',
      message: 'Please correct the highlighted fields.',
      retryable: false,
      fieldErrors: fieldErrorsMap,
    }),
  duplicate: () =>
    fail<{ target: Target }>({
      code: 'TARGET_DUPLICATE_PERIOD',
      category: 'business',
      message: 'A target for this period and start date already exists.',
      retryable: false,
    }),
  unexpected: () =>
    fail<{ target: Target }>({
      code: 'INTERNAL',
      category: 'business',
      message: 'Something went wrong. Please try again.',
      retryable: true,
    }),
  unauthorized: () =>
    fail<{ target: Target }>({
      code: 'WORKSPACE_NOT_MEMBER',
      category: 'authorization',
      message: 'Please sign in.',
      retryable: false,
    }),
  notFound: () =>
    fail<{ target: Target }>({
      code: 'NOT_FOUND',
      category: 'business',
      message: 'Target not found.',
      retryable: false,
    }),
};

/** Postgres unique-violation on the one-per-period index (docs/04 §13.2). */
function isDuplicate(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505';
}

export async function createTargetAction(
  _prev: ActionResult<{ target: Target }> | null,
  formData: FormData,
): Promise<ActionResult<{ target: Target }>> {
  let targetId: string;
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = targetInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return targetErrors.validation(fieldErrors(parsed.error));
    const target = await createTarget(ctx, parsed.data);
    targetId = target.id;
  } catch (err) {
    if (err instanceof WorkspaceContextError) return targetErrors.unauthorized();
    if (isDuplicate(err)) return targetErrors.duplicate();
    console.error('[target] create failed', err);
    return targetErrors.unexpected();
  }
  revalidatePath('/settings/revenue');
  revalidatePath('/');
  redirect(`/settings/revenue/${targetId}`, RedirectType.push);
}

export async function updateTargetAction(
  _prev: ActionResult<{ target: Target }> | null,
  formData: FormData,
): Promise<ActionResult<{ target: Target }>> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') return targetErrors.notFound();
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = targetInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return targetErrors.validation(fieldErrors(parsed.error));
    const target = await updateTarget(ctx, id, parsed.data);
    if (!target) return targetErrors.notFound();
  } catch (err) {
    if (err instanceof WorkspaceContextError) return targetErrors.unauthorized();
    if (isDuplicate(err)) return targetErrors.duplicate();
    console.error('[target] update failed', err);
    return targetErrors.unexpected();
  }
  revalidatePath('/settings/revenue');
  revalidatePath(`/settings/revenue/${id}`);
  revalidatePath('/');
  redirect(`/settings/revenue/${id}`, RedirectType.push);
}

export async function deleteTargetAction(formData: FormData): Promise<void> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') redirect('/settings/revenue');
  const ctx = await requireWorkspaceContext();
  await deleteTarget(ctx, id as string);
  revalidatePath('/settings/revenue');
  revalidatePath('/');
  redirect('/settings/revenue');
}
