import type { UsageStore } from './ports';
import { RouterError, type CapabilityConfig } from './types';

/**
 * Cost gating (docs/09 §6.2) — runs BEFORE dispatch, pipeline step 3. The live
 * monthly sum over ai_usage_events is the source of truth (Sprint 3.3 decision
 * #6). Order: per-request hard cap → monthly budget → 80% warning.
 */

export type BudgetCheckResult = {
  monthlySpendUsd: number;
  monthlyBudgetUsd: number;
  warned: boolean;
};

const warningShownAt = new Map<string, number>();
const WARNING_INTERVAL_MS = 4 * 3_600_000; // "no warning shown in last 4h" (docs/09 §6.2)

export function resetBudgetWarningsForTests(): void {
  warningShownAt.clear();
}

export async function checkBudget(params: {
  usageStore: UsageStore;
  workspaceId: string;
  config: CapabilityConfig;
  estimatedCostUsd: number;
  onWarning?: (info: { workspaceId: string; spend: number; budget: number }) => void;
  now?: number;
}): Promise<BudgetCheckResult> {
  const { usageStore, workspaceId, config, estimatedCostUsd, onWarning } = params;
  const now = params.now ?? Date.now();

  if (estimatedCostUsd > config.hardMaxUsd) {
    throw new RouterError(
      'AI_BUDGET_EXCEEDED',
      `estimated cost $${estimatedCostUsd.toFixed(4)} exceeds ${config.capability} per-request cap $${config.hardMaxUsd}`,
    );
  }

  const [spend, budget] = await Promise.all([
    usageStore.getMonthlySpendUsd(workspaceId),
    usageStore.getMonthlyBudgetUsd(workspaceId),
  ]);

  if (spend >= budget) {
    throw new RouterError(
      'AI_BUDGET_EXCEEDED',
      `workspace monthly AI budget exhausted ($${spend.toFixed(2)} of $${budget.toFixed(2)})`,
    );
  }

  let warned = false;
  if (spend >= 0.8 * budget) {
    const last = warningShownAt.get(workspaceId) ?? 0;
    if (now - last >= WARNING_INTERVAL_MS) {
      warningShownAt.set(workspaceId, now);
      warned = true;
      onWarning?.({ workspaceId, spend, budget });
    }
  }

  return { monthlySpendUsd: spend, monthlyBudgetUsd: budget, warned };
}
