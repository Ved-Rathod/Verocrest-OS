import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkBudget, resetBudgetWarningsForTests } from './budget';
import type { AiUsageRecord, UsageStore } from './ports';
import { getCapabilityConfig } from './capabilities';
import { RouterError } from './types';

const config = getCapabilityConfig('summarize-thread')!;
const WS = '11111111-1111-4111-8111-111111111111';

function usageStore(spend: number, budget = 200): UsageStore {
  return {
    getMonthlySpendUsd: () => Promise.resolve(spend),
    getMonthlyBudgetUsd: () => Promise.resolve(budget),
    logUsageWithEvent: (_r: AiUsageRecord) => Promise.resolve(),
    logUsageError: () => Promise.resolve(),
  };
}

afterEach(() => resetBudgetWarningsForTests());

describe('cost gating (docs/09 §6.2)', () => {
  it('refuses pre-dispatch when the per-request hard cap is exceeded', async () => {
    await expect(
      checkBudget({
        usageStore: usageStore(0),
        workspaceId: WS,
        config,
        estimatedCostUsd: config.hardMaxUsd + 0.01,
      }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
  });

  it('refuses with AI_BUDGET_EXCEEDED when the monthly budget is exhausted', async () => {
    const err = await checkBudget({
      usageStore: usageStore(200, 200),
      workspaceId: WS,
      config,
      estimatedCostUsd: 0.001,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RouterError);
    expect((err as RouterError).code).toBe('AI_BUDGET_EXCEEDED');
  });

  it('warns once at >=80% and throttles repeats within 4h', async () => {
    const onWarning = vi.fn();
    const store = usageStore(160, 200);
    const t0 = Date.now();
    await checkBudget({
      usageStore: store,
      workspaceId: WS,
      config,
      estimatedCostUsd: 0.001,
      onWarning,
      now: t0,
    });
    await checkBudget({
      usageStore: store,
      workspaceId: WS,
      config,
      estimatedCostUsd: 0.001,
      onWarning,
      now: t0 + 60_000,
    });
    expect(onWarning).toHaveBeenCalledTimes(1);
    await checkBudget({
      usageStore: store,
      workspaceId: WS,
      config,
      estimatedCostUsd: 0.001,
      onWarning,
      now: t0 + 5 * 3_600_000,
    });
    expect(onWarning).toHaveBeenCalledTimes(2);
  });

  it('passes quietly under 80%', async () => {
    const onWarning = vi.fn();
    const result = await checkBudget({
      usageStore: usageStore(10, 200),
      workspaceId: WS,
      config,
      estimatedCostUsd: 0.001,
      onWarning,
    });
    expect(result.warned).toBe(false);
    expect(onWarning).not.toHaveBeenCalled();
  });
});
