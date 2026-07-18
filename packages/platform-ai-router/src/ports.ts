/**
 * Persistence ports for the Router (hexagonal seam so the pipeline is fully
 * unit-testable without a database). Supabase implementations live in
 * supabase-stores.ts; tests inject in-memory fakes.
 */

export type AiUsageRecord = {
  id: string; // app-generated uuid, referenced by ai.output.produced subject_id
  workspaceId: string;
  requestId: string;
  capability: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  callerModule: string;
  promptId: string;
  promptVersion: number;
  promptLibraryId?: string;
  status: 'ok' | 'error';
  error?: Record<string, unknown>;
  occurredAt: string;
};

export interface UsageStore {
  /** Live month-to-date spend from ai_usage_events (docs/09 §6.2 — source of truth). */
  getMonthlySpendUsd(workspaceId: string): Promise<number>;

  /** workspaces.ai_budget_monthly_usd (docs/09 §6.1). */
  getMonthlyBudgetUsd(workspaceId: string): Promise<number>;

  /**
   * Atomic write of the usage row + its ai.output.produced journal row
   * (log_ai_usage_with_event RPC, Amendment 005). Success path only.
   */
  logUsageWithEvent(record: AiUsageRecord, journalRow: Record<string, unknown>): Promise<void>;

  /** Plain append of a failed call (status='error'); no bus event is produced. */
  logUsageError(record: AiUsageRecord): Promise<void>;
}
