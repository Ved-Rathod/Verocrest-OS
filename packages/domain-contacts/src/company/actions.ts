'use server';

import { revalidatePath } from 'next/cache';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, ok, type ActionResult } from '@verocrest/platform-tenancy';
import { normalizeDomain } from './domain';
import { companyErrors, mapCompanyDbError } from './errors';
import { createCompany, listCompanies, softDeleteCompany, updateCompany } from './service';
import type { Company, CompanyPage } from './types';
import {
  companyInputSchema,
  companyListParamsSchema,
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

    const company = await createCompany(ctx, parsed.data);
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

    const company = await updateCompany(ctx, id, parsed.data);
    if (!company) return fail(companyErrors.notFound());
    revalidatePath('/companies');
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
  try {
    const ctx = await requireWorkspaceContext();
    const id = formData.get('companyId');
    if (typeof id !== 'string' || id === '') return fail(companyErrors.notFound());

    const deleted = await softDeleteCompany(ctx, id);
    if (!deleted) return fail(companyErrors.notFound());
    revalidatePath('/companies');
    return ok({ deleted: true });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(companyErrors.notAuthorized());
    return fail(mapCompanyDbError(error as { code?: string; message?: string }));
  }
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
