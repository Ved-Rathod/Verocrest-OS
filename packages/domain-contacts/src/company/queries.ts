import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { getCompany, getCompanyDetail, listCompanies, listCompanyContacts } from './service';
import { isDbError } from './service';
import type { Company, CompanyContactRef, CompanyDetail, CompanyPage } from './types';
import { companyListParamsSchema, type CompanyListParams } from './validation';

/**
 * Server-component read helpers (RSC-facing). They resolve the active workspace
 * and delegate to the service. Failures are normalized to CompaniesUnavailable
 * so the page can render a friendly panel (missing migration / no access) rather
 * than a raw crash — mirrors the Sprint 1.4 workspace-setup guard.
 */
export type CompaniesUnavailableReason = 'setup' | 'access' | 'unknown';

export class CompaniesUnavailableError extends Error {
  readonly reason: CompaniesUnavailableReason;
  constructor(reason: CompaniesUnavailableReason) {
    super(`companies unavailable: ${reason}`);
    this.name = 'CompaniesUnavailableError';
    this.reason = reason;
  }
}

function normalize(error: unknown): CompaniesUnavailableError {
  if (error instanceof WorkspaceContextError) return new CompaniesUnavailableError('access');
  if (isDbError(error)) {
    if (error.code === '42P01') return new CompaniesUnavailableError('setup');
    if (error.code === '42501') return new CompaniesUnavailableError('access');
  }
  return new CompaniesUnavailableError('unknown');
}

export async function getCompaniesPage(
  params: Partial<CompanyListParams> = {},
): Promise<CompanyPage> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = companyListParamsSchema.parse(params);
    return await listCompanies(ctx, parsed);
  } catch (error) {
    throw normalize(error);
  }
}

export async function getCompanyById(id: string): Promise<Company | null> {
  try {
    const ctx = await requireWorkspaceContext();
    return await getCompany(ctx, id);
  } catch (error) {
    throw normalize(error);
  }
}

export async function getCompanyDetailPage(id: string): Promise<CompanyDetail | null> {
  try {
    const ctx = await requireWorkspaceContext();
    return await getCompanyDetail(ctx, id);
  } catch (error) {
    throw normalize(error);
  }
}

export async function getCompanyContactsPage(id: string): Promise<CompanyContactRef[]> {
  try {
    const ctx = await requireWorkspaceContext();
    return await listCompanyContacts(ctx, id);
  } catch (error) {
    throw normalize(error);
  }
}
