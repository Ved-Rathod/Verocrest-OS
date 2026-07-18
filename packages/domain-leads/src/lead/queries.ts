import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { getLeadDetail, isDbError, listLeads } from './service';
import type { LeadDetail, LeadPage } from './types';
import { leadListParamsSchema, type LeadListParams } from './validation';

/** RSC read helpers with friendly failure normalization (setup / access / unknown). */
export type LeadsUnavailableReason = 'setup' | 'access' | 'unknown';

export class LeadsUnavailableError extends Error {
  readonly reason: LeadsUnavailableReason;
  constructor(reason: LeadsUnavailableReason) {
    super(`leads unavailable: ${reason}`);
    this.name = 'LeadsUnavailableError';
    this.reason = reason;
  }
}

function normalize(error: unknown): LeadsUnavailableError {
  if (error instanceof WorkspaceContextError) return new LeadsUnavailableError('access');
  if (isDbError(error)) {
    if (error.code === '42P01') return new LeadsUnavailableError('setup');
    if (error.code === '42501') return new LeadsUnavailableError('access');
  }
  return new LeadsUnavailableError('unknown');
}

export async function getLeadsPage(params: Partial<LeadListParams> = {}): Promise<LeadPage> {
  try {
    const ctx = await requireWorkspaceContext();
    const parsed = leadListParamsSchema.parse(params);
    return await listLeads(ctx, parsed);
  } catch (error) {
    throw normalize(error);
  }
}

export async function getLeadDetailPage(id: string): Promise<LeadDetail | null> {
  try {
    const ctx = await requireWorkspaceContext();
    return await getLeadDetail(ctx, id);
  } catch (error) {
    throw normalize(error);
  }
}
