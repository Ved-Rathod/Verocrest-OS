'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { z } from 'zod';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, type ActionResult } from '@verocrest/platform-tenancy';
import { UnsafeUrlError } from './analysis/fetch';
import { analyzeAndRecord } from './audit/service';
import type { Audit } from './audit/types';
import { analyzeInputSchema } from './audit/validation';

/**
 * Website Intelligence Server Actions (docs/05 §7, docs/10 §10.x). Validate the
 * URL, run the synchronous analyzer (which emits `website.audit.completed`), then
 * redirect to the results. SSRF / unreachable-host errors surface as field errors.
 */

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    out[key] ??= issue.message;
  }
  return out;
}

const errors = {
  validation: (fe: Record<string, string>) =>
    fail<{ audit: Audit }>({
      code: 'VALIDATION_ERROR',
      category: 'validation',
      message: 'Please correct the highlighted fields.',
      retryable: false,
      fieldErrors: fe,
    }),
  unsafe: (message: string) =>
    fail<{ audit: Audit }>({
      code: 'AUDIT_URL_UNSAFE',
      category: 'validation',
      message,
      retryable: false,
      fieldErrors: { url: message },
    }),
  fetchFailed: () =>
    fail<{ audit: Audit }>({
      code: 'AUDIT_FETCH_FAILED',
      category: 'business',
      message: 'Could not fetch that website. Check the URL and try again.',
      retryable: true,
      fieldErrors: { url: 'Could not fetch that website.' },
    }),
  unauthorized: () =>
    fail<{ audit: Audit }>({
      code: 'WORKSPACE_NOT_MEMBER',
      category: 'authorization',
      message: 'Please sign in.',
      retryable: false,
    }),
  unexpected: () =>
    fail<{ audit: Audit }>({
      code: 'INTERNAL',
      category: 'business',
      message: 'Something went wrong. Please try again.',
      retryable: true,
    }),
};

export async function analyzeWebsiteAction(
  _prev: ActionResult<{ audit: Audit }> | null,
  formData: FormData,
): Promise<ActionResult<{ audit: Audit }>> {
  let auditId: string;
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = analyzeInputSchema.safeParse({ url: formData.get('url') });
    if (!parsed.success) return errors.validation(fieldErrors(parsed.error));
    const audit = await analyzeAndRecord(ctx, parsed.data);
    auditId = audit.id;
  } catch (err) {
    if (err instanceof WorkspaceContextError) return errors.unauthorized();
    if (err instanceof UnsafeUrlError) return errors.unsafe(err.message);
    // A network/DNS/abort failure while fetching the target site.
    if (err instanceof Error && /fetch|network|abort|timeout|ENOTFOUND|ECONN/i.test(err.message)) {
      return errors.fetchFailed();
    }
    console.error('[website-intelligence] analyze failed', err);
    return errors.unexpected();
  }
  revalidatePath('/settings/website');
  revalidatePath('/');
  redirect(`/settings/website/${auditId}`, RedirectType.push);
}
