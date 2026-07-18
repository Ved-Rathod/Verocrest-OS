'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, ok, type ActionResult } from '@verocrest/platform-tenancy';
import { listActiveDefinitionsSafe } from '../custom-fields/service';
import { buildCustomFields } from '../custom-fields/validation';
import { normalizeDomain } from './domain';
import { companyErrors, mapCompanyDbError, mapMergeError } from './errors';
import {
  createCompany,
  listCompanies,
  mergeCompanies,
  softDeleteCompany,
  updateCompany,
} from './service';
import type { Company, CompanyPage } from './types';
import {
  companyInputSchema,
  companyListParamsSchema,
  companyMergeSchema,
  parseTags,
  toFieldErrors,
  type CompanyInput,
} from './validation';

/**
 * Company Server Actions (docs/10 §3.1, §6.1). Each resolves the workspace
 * context (fail-closed), validates, delegates to the service, maps DB errors to
 * canonical codes, and revalidates the list. Envelope per docs/10 §10.
 */

function inputFromFormData(formData: FormData): unknown {
  return {
    name: formData.get('name'),
    domain: formData.get('domain'),
    websiteUrl: formData.get('websiteUrl'),
    industry: formData.get('industry'),
    size: formData.get('size'),
    employeeCount: formData.get('employeeCount'),
    description: formData.get('description'),
    isClient: formData.get('isClient'),
    tags: parseTags(formData.get('tags')),
  };
}

/** Validate + reject a domain that is present but not a real host. */
function validateDomain(input: CompanyInput): Record<string, string> | null {
  if (input.domain && normalizeDomain(input.domain) === null) {
    return { domain: 'Enter a valid domain, e.g. acme.com' };
  }
  return null;
}

export async function createCompanyAction(
  _prev: ActionResult<{ company: Company }> | null,
  formData: FormData,
): Promise<ActionResult<{ company: Company }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = companyInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return fail(companyErrors.validation(toFieldErrors(parsed.error)));

    const domainError = validateDomain(parsed.data);
    if (domainError) return fail(companyErrors.validation(domainError));

    // Custom fields: validate submitted cf__* values against active definitions
    // (server-authoritative; unknown cf__* keys are ignored, never persisted).
    const defs = await listActiveDefinitionsSafe(ctx, 'company');
    const cf = buildCustomFields(defs, formData);
    if (Object.keys(cf.errors).length > 0) return fail(companyErrors.validation(cf.errors));

    const company = await createCompany(ctx, parsed.data, cf.values);
    revalidatePath('/companies');
    return ok({ company });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(companyErrors.notAuthorized());
    return fail(mapCompanyDbError(error as { code?: string; message?: string }));
  }
}

export async function updateCompanyAction(
  _prev: ActionResult<{ company: Company }> | null,
  formData: FormData,
): Promise<ActionResult<{ company: Company }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const id = formData.get('companyId');
    if (typeof id !== 'string' || id === '') return fail(companyErrors.notFound());

    const parsed = companyInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return fail(companyErrors.validation(toFieldErrors(parsed.error)));

    const domainError = validateDomain(parsed.data);
    if (domainError) return fail(companyErrors.validation(domainError));

    const defs = await listActiveDefinitionsSafe(ctx, 'company');
    const cf = buildCustomFields(defs, formData);
    if (Object.keys(cf.errors).length > 0) return fail(companyErrors.validation(cf.errors));

    const company = await updateCompany(ctx, id, parsed.data, cf.values);
    if (!company) return fail(companyErrors.notFound());
    revalidatePath('/companies');
    revalidatePath(`/companies/${id}`);
    revalidatePath(`/companies/${id}/edit`);
    return ok({ company });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(companyErrors.notAuthorized());
    return fail(mapCompanyDbError(error as { code?: string; message?: string }));
  }
}

export async function deleteCompanyAction(
  _prev: ActionResult<{ deleted: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ deleted: boolean }>> {
  // Archive-from-DETAIL leaves the page SERVER-SIDE (Sprint-2.4 fix, mirrored to
  // leads/reminders): revalidatePath in an action re-renders the CURRENT route in
  // the same response, so a soft-deleted detail page hits notFound() and a 404
  // commits in place before any client router.replace() can run. When a redirect
  // is requested we skip revalidatePath (the list is force-dynamic) and navigate
  // via redirect(replace) — OUTSIDE the try/catch, since redirect() throws
  // NEXT_REDIRECT. Same-origin relative paths only. The LIST dialog omits
  // redirectTo and keeps optimistic row removal + the revalidate purge.
  const rawRedirect = formData.get('redirectTo');
  const redirectTo =
    typeof rawRedirect === 'string' && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : null;

  try {
    const ctx = await requireWorkspaceContext();
    const id = formData.get('companyId');
    if (typeof id !== 'string' || id === '') return fail(companyErrors.notFound());

    const deleted = await softDeleteCompany(ctx, id);
    if (!deleted) return fail(companyErrors.notFound());
    if (!redirectTo) revalidatePath('/companies');
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(companyErrors.notAuthorized());
    return fail(mapCompanyDbError(error as { code?: string; message?: string }));
  }

  if (redirectTo) redirect(redirectTo, RedirectType.replace);
  return ok({ deleted: true });
}

/**
 * Merge a duplicate company into a survivor (docs/10 §6.1.7). Owner-only (checked
 * here AND in the rpc). Invoked from the SOURCE company's detail page, which the
 * merge archives — so, like archive-from-detail, we navigate SERVER-SIDE to the
 * survivor's detail (redirect + replace, no revalidate of the current route) to
 * avoid the notFound()-in-place 404 race. redirect() is outside the try/catch.
 */
export async function mergeCompaniesAction(
  _prev: ActionResult<{ movedContacts: number; movedLeads: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ movedContacts: number; movedLeads: number }>> {
  // Validate up front (pure, no throw) so `targetId` is definitely assigned for
  // the trailing redirect, which MUST sit outside the try/catch (redirect throws
  // NEXT_REDIRECT — a catch would swallow the navigation into a false error).
  const parsed = companyMergeSchema.safeParse({
    sourceCompanyId: formData.get('sourceCompanyId'),
    targetCompanyId: formData.get('targetCompanyId'),
  });
  if (!parsed.success) return fail(companyErrors.validation(toFieldErrors(parsed.error)));
  const targetId = parsed.data.targetCompanyId;

  let movedContacts = 0;
  let movedLeads = 0;
  try {
    const ctx = await requireWorkspaceContext();
    if (ctx.role !== 'owner') return fail(companyErrors.mergeForbidden());
    const result = await mergeCompanies(ctx, parsed.data.sourceCompanyId, targetId);
    movedContacts = result.movedContacts;
    movedLeads = result.movedLeads;
    // No revalidatePath: we redirect to the survivor (force-dynamic); revalidating
    // here would re-render the just-archived source detail into a 404.
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(companyErrors.notAuthorized());
    return fail(mapMergeError(error as { code?: string; message?: string }));
  }

  redirect(
    `/companies/${targetId}?merged=1&mc=${movedContacts}&ml=${movedLeads}`,
    RedirectType.replace,
  );
}

/** "Load more" pagination for the client table (docs/10 §12.3). */
export async function loadCompaniesPageAction(rawParams: {
  search?: string;
  isClient?: string;
  cursor?: string;
}): Promise<ActionResult<CompanyPage>> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = companyListParamsSchema.safeParse(rawParams);
    if (!parsed.success) return fail(companyErrors.validation(toFieldErrors(parsed.error)));
    const page = await listCompanies(ctx, parsed.data);
    return ok(page);
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(companyErrors.notAuthorized());
    return fail(mapCompanyDbError(error as { code?: string; message?: string }));
  }
}
