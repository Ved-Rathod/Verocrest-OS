'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, ok, type ActionResult } from '@verocrest/platform-tenancy';
import { leadErrors, mapLeadDbError } from './errors';
import { parseLeadFormData as inputFromFormData } from './form';
import {
  createLead,
  listLeads,
  resolveContactForLead,
  softDeleteLead,
  updateLead,
} from './service';
import type { Lead, LeadPage } from './types';
import { leadInputSchema, leadListParamsSchema, toFieldErrors } from './validation';

/**
 * Lead Server Actions (docs/10 §3.1, §6.3; amended docs/04 §5.1). Contact is
 * REQUIRED and validated against the workspace; company derives from the
 * contact (Amendment 001). Envelope per docs/10 §10.
 * FormData parsing lives in ./form (pure, unit-tested).
 */

export async function createLeadAction(
  _prev: ActionResult<{ lead: Lead }> | null,
  formData: FormData,
): Promise<ActionResult<{ lead: Lead }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = leadInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return fail(leadErrors.validation(toFieldErrors(parsed.error)));

    const contact = await resolveContactForLead(ctx, parsed.data.contactId);
    if (!contact) return fail(leadErrors.contactNotFound());

    const lead = await createLead(ctx, parsed.data, contact);
    revalidatePath('/leads');
    return ok({ lead });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(leadErrors.notAuthorized());
    return fail(mapLeadDbError(error as { code?: string; message?: string }));
  }
}

export async function updateLeadAction(
  _prev: ActionResult<{ lead: Lead }> | null,
  formData: FormData,
): Promise<ActionResult<{ lead: Lead }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const id = formData.get('leadId');
    if (typeof id !== 'string' || id === '') return fail(leadErrors.notFound());

    const parsed = leadInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return fail(leadErrors.validation(toFieldErrors(parsed.error)));

    const contact = await resolveContactForLead(ctx, parsed.data.contactId);
    if (!contact) return fail(leadErrors.contactNotFound());

    const lead = await updateLead(ctx, id, parsed.data, contact);
    if (!lead) return fail(leadErrors.notFound());
    revalidatePath('/leads');
    revalidatePath(`/leads/${id}`);
    revalidatePath(`/leads/${id}/edit`);
    return ok({ lead });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(leadErrors.notAuthorized());
    return fail(mapLeadDbError(error as { code?: string; message?: string }));
  }
}

export async function deleteLeadAction(
  _prev: ActionResult<{ deleted: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ deleted: boolean }>> {
  // Archive-from-DETAIL must leave the page SERVER-SIDE (mirrors
  // archiveReminderAction — Sprint 2.4 QA fix). Two traps:
  // 1. revalidatePath in an action re-renders the CURRENT route in the same
  //    response — the soft-deleted detail page hits notFound() and a 404 commits
  //    in place before any client effect can router.replace(). When a redirect
  //    is requested we skip revalidatePath (the list is force-dynamic; the
  //    redirect fetches it fresh) and navigate via redirect() with
  //    RedirectType.replace, dropping the dead detail URL from history.
  // 2. redirect() throws NEXT_REDIRECT — it must live OUTSIDE the try/catch or
  //    the catch would swallow the navigation and return a false error envelope.
  // Same-origin relative paths only. The LIST dialog sends no redirectTo:
  // it stays in place (optimistic row removal) and gets the revalidatePath purge.
  const rawRedirect = formData.get('redirectTo');
  const redirectTo =
    typeof rawRedirect === 'string' && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : null;

  try {
    const ctx = await requireWorkspaceContext();
    const id = formData.get('leadId');
    if (typeof id !== 'string' || id === '') return fail(leadErrors.notFound());

    const deleted = await softDeleteLead(ctx, id);
    if (!deleted) return fail(leadErrors.notFound());
    if (!redirectTo) revalidatePath('/leads');
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(leadErrors.notAuthorized());
    return fail(mapLeadDbError(error as { code?: string; message?: string }));
  }

  if (redirectTo) redirect(redirectTo, RedirectType.replace);
  return ok({ deleted: true });
}

/** "Load more" pagination for the client table (docs/10 §12.3). */
export async function loadLeadsPageAction(rawParams: {
  search?: string;
  status?: string;
  priority?: string;
  cursor?: string;
}): Promise<ActionResult<LeadPage>> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = leadListParamsSchema.safeParse(rawParams);
    if (!parsed.success) return fail(leadErrors.validation(toFieldErrors(parsed.error)));
    const page = await listLeads(ctx, parsed.data);
    return ok(page);
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(leadErrors.notAuthorized());
    return fail(mapLeadDbError(error as { code?: string; message?: string }));
  }
}
