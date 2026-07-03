import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { CompaniesUnavailableError, type CompaniesUnavailableReason } from '../company/queries';
import { isDbError } from '../company/service';
import { getContactDetail, listContacts } from './service';
import type { ContactDetail, ContactPage } from './types';
import { contactListParamsSchema, type ContactListParams } from './validation';

/**
 * Server-component read helpers (RSC-facing). Failures normalize to
 * CompaniesUnavailableError (reused; reason='setup' means the CONTACTS migration
 * is missing) so the page renders a friendly panel rather than crashing.
 */
function normalize(error: unknown): CompaniesUnavailableError {
  if (error instanceof WorkspaceContextError) return new CompaniesUnavailableError('access');
  if (isDbError(error)) {
    if (error.code === '42P01') return new CompaniesUnavailableError('setup');
    if (error.code === '42501') return new CompaniesUnavailableError('access');
  }
  return new CompaniesUnavailableError('unknown');
}

export async function getContactsPage(
  params: Partial<ContactListParams> = {},
): Promise<ContactPage> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = contactListParamsSchema.parse(params);
    return await listContacts(ctx, parsed);
  } catch (error) {
    throw normalize(error);
  }
}

export async function getContactDetailPage(id: string): Promise<ContactDetail | null> {
  try {
    const ctx = await requireWorkspaceContext();
    return await getContactDetail(ctx, id);
  } catch (error) {
    throw normalize(error);
  }
}

export type { CompaniesUnavailableReason };
