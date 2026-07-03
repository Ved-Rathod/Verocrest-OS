'use server';

import { revalidatePath } from 'next/cache';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, ok, type ActionResult } from '@verocrest/platform-tenancy';
import { getCompany, searchCompanies, type CompanyOption } from '../company/service';
import { toFieldErrors } from '../company/validation';
import { contactErrors, mapContactDbError } from './errors';
import {
  createContact,
  listContacts,
  softDeleteContact,
  updateContact,
  type CompanyLink,
} from './service';
import type { Contact, ContactPage } from './types';
import { contactInputSchema, contactListParamsSchema, type ContactInput } from './validation';

/** Contact Server Actions (docs/10 §3.1, §6.2). Envelope per docs/10 §10. */

function inputFromFormData(formData: FormData): unknown {
  return {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    primaryEmail: formData.get('primaryEmail'),
    phone: formData.get('phone'),
    companyId: formData.get('companyId'),
    roleTitle: formData.get('roleTitle'),
    seniority: formData.get('seniority'),
    isDecisionMaker: formData.get('isDecisionMaker'),
    websiteUrl: formData.get('websiteUrl'),
    linkedinUrl: formData.get('linkedinUrl'),
    notes: formData.get('notes'),
    isClient: formData.get('isClient'),
    tags:
      typeof formData.get('tags') === 'string'
        ? String(formData.get('tags'))
            .split(/[\n,]/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0 && t.length <= 40)
            .slice(0, 50)
        : [],
  };
}

/**
 * Resolve + validate the company link: a submitted companyId must belong to the
 * caller's workspace; its authoritative name is copied into company_name
 * (docs/04 §4.1 display cache). Returns null-link when no company selected.
 */
async function resolveCompanyLink(
  ctx: Awaited<ReturnType<typeof requireWorkspaceContext>>,
  input: ContactInput,
): Promise<CompanyLink | 'not_found'> {
  if (!input.companyId) return { companyId: null, companyName: null };
  const company = await getCompany(ctx, input.companyId);
  if (!company) return 'not_found';
  return { companyId: company.id, companyName: company.name };
}

export async function createContactAction(
  _prev: ActionResult<{ contact: Contact }> | null,
  formData: FormData,
): Promise<ActionResult<{ contact: Contact }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = contactInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return fail(contactErrors.validation(toFieldErrors(parsed.error)));

    const link = await resolveCompanyLink(ctx, parsed.data);
    if (link === 'not_found') return fail(contactErrors.companyNotFound());

    const contact = await createContact(ctx, parsed.data, link);
    revalidatePath('/contacts');
    return ok({ contact });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(contactErrors.notAuthorized());
    return fail(mapContactDbError(error as { code?: string; message?: string }));
  }
}

export async function updateContactAction(
  _prev: ActionResult<{ contact: Contact }> | null,
  formData: FormData,
): Promise<ActionResult<{ contact: Contact }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const id = formData.get('contactId');
    if (typeof id !== 'string' || id === '') return fail(contactErrors.notFound());

    const parsed = contactInputSchema.safeParse(inputFromFormData(formData));
    if (!parsed.success) return fail(contactErrors.validation(toFieldErrors(parsed.error)));

    const link = await resolveCompanyLink(ctx, parsed.data);
    if (link === 'not_found') return fail(contactErrors.companyNotFound());

    const contact = await updateContact(ctx, id, parsed.data, link);
    if (!contact) return fail(contactErrors.notFound());
    revalidatePath('/contacts');
    revalidatePath(`/contacts/${id}`);
    revalidatePath(`/contacts/${id}/edit`);
    return ok({ contact });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(contactErrors.notAuthorized());
    return fail(mapContactDbError(error as { code?: string; message?: string }));
  }
}

export async function deleteContactAction(
  _prev: ActionResult<{ deleted: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const id = formData.get('contactId');
    if (typeof id !== 'string' || id === '') return fail(contactErrors.notFound());

    const deleted = await softDeleteContact(ctx, id);
    if (!deleted) return fail(contactErrors.notFound());
    revalidatePath('/contacts');
    return ok({ deleted: true });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(contactErrors.notAuthorized());
    return fail(mapContactDbError(error as { code?: string; message?: string }));
  }
}

/** "Load more" pagination for the client table (docs/10 §12.3). */
export async function loadContactsPageAction(rawParams: {
  search?: string;
  isClient?: string;
  companyId?: string;
  cursor?: string;
}): Promise<ActionResult<ContactPage>> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = contactListParamsSchema.safeParse(rawParams);
    if (!parsed.success) return fail(contactErrors.validation(toFieldErrors(parsed.error)));
    const page = await listContacts(ctx, parsed.data);
    return ok(page);
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(contactErrors.notAuthorized());
    return fail(mapContactDbError(error as { code?: string; message?: string }));
  }
}

/** Company search for the picker combobox. */
export async function searchCompaniesForPickerAction(
  query: string,
): Promise<ActionResult<{ options: CompanyOption[] }>> {
  try {
    const ctx = await requireWorkspaceContext();
    const options = await searchCompanies(ctx, query, 10);
    return ok({ options });
  } catch (error) {
    if (error instanceof WorkspaceContextError) return fail(contactErrors.notAuthorized());
    return fail(mapContactDbError(error as { code?: string; message?: string }));
  }
}
