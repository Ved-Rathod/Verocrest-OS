import 'server-only';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';

/**
 * Read model for Settings → AI Usage (docs/09 §6.6, docs/06 §5.10). All reads
 * are RLS-scoped through the cookie client (member SELECT policies on
 * ai_usage_daily / ai_usage_events / workspaces). No service role, no writes.
 *
 * Two sources, by design:
 * - ai_usage_daily (docs/04 §18.2) — the rollup: cheap per-day totals for the
 *   budget gauge + 30-day trend.
 * - ai_usage_events (docs/04 §18.1) — the authoritative per-call record: the
 *   ONLY place cost is attributed to a capability + model. The daily rollup's
 *   by_capability / by_model jsonb holds CALL COUNTS (not spend), so
 *   spend-by-capability is aggregated from events, indexed on
 *   (workspace_id, capability, occurred_at).
 */

export type CostSlice = { key: string; costUsd: number; calls: number };
export type UsageDay = { day: string; costUsd: number };

export type AiUsageOverview = {
  monthLabel: string;
  monthToDateUsd: number;
  budgetUsd: number;
  /** monthToDate / budget, clamped ≥ 0; may exceed 1 when over budget. */
  fractionUsed: number;
  overEightyPct: boolean;
  overBudget: boolean;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byCapability: CostSlice[];
  byModel: CostSlice[];
  trend: UsageDay[];
  hasAnyUsage: boolean;
};

const TREND_DAYS = 30;

function utcDayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getAiUsageOverview(ctx: WorkspaceContext): Promise<AiUsageOverview> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const trendStart = new Date(now);
  trendStart.setUTCDate(trendStart.getUTCDate() - (TREND_DAYS - 1));
  // Fetch daily rows back to whichever window starts earlier (month vs. trend).
  const dailyFrom = utcDayString(firstOfMonth < trendStart ? firstOfMonth : trendStart);

  const [dailyRes, budgetRes, eventsRes] = await Promise.all([
    supabase
      .from('ai_usage_daily')
      .select('day, total_calls, total_cost_usd, total_input_tokens, total_output_tokens')
      .eq('workspace_id', ctx.workspaceId)
      .gte('day', dailyFrom)
      .order('day', { ascending: true }),
    supabase
      .from('workspaces')
      .select('ai_budget_monthly_usd')
      .eq('id', ctx.workspaceId)
      .maybeSingle(),
    supabase
      .from('ai_usage_events')
      .select('capability, model, cost_usd')
      .eq('workspace_id', ctx.workspaceId)
      .gte('occurred_at', firstOfMonth.toISOString()),
  ]);

  if (dailyRes.error) throw dailyRes.error;
  if (budgetRes.error) throw budgetRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const dailyRows = dailyRes.data ?? [];
  const firstOfMonthStr = utcDayString(firstOfMonth);

  // Month-to-date totals from the daily rollup (calendar month — D3).
  let monthToDateUsd = 0;
  let totalCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const row of dailyRows) {
    if (String(row.day) < firstOfMonthStr) continue;
    monthToDateUsd += Number(row.total_cost_usd ?? 0);
    totalCalls += Number(row.total_calls ?? 0);
    totalInputTokens += Number(row.total_input_tokens ?? 0);
    totalOutputTokens += Number(row.total_output_tokens ?? 0);
  }

  // Spend attribution from the authoritative per-call record.
  const capMap = new Map<string, CostSlice>();
  const modelMap = new Map<string, CostSlice>();
  const accumulate = (map: Map<string, CostSlice>, key: string, cost: number): void => {
    const slice = map.get(key) ?? { key, costUsd: 0, calls: 0 };
    slice.costUsd += cost;
    slice.calls += 1;
    map.set(key, slice);
  };
  for (const ev of eventsRes.data ?? []) {
    const cost = Number(ev.cost_usd ?? 0);
    accumulate(capMap, String(ev.capability), cost);
    accumulate(modelMap, String(ev.model), cost);
  }
  const byCostDesc = (a: CostSlice, b: CostSlice): number => b.costUsd - a.costUsd;
  const byCapability = [...capMap.values()].sort(byCostDesc);
  const byModel = [...modelMap.values()].sort(byCostDesc);

  // 30-day trend, zero-filled oldest → newest.
  const dailyCostByDay = new Map<string, number>();
  for (const row of dailyRows) {
    dailyCostByDay.set(String(row.day), Number(row.total_cost_usd ?? 0));
  }
  const trend: UsageDay[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = utcDayString(d);
    trend.push({ day: key, costUsd: dailyCostByDay.get(key) ?? 0 });
  }

  const budgetUsd = Number(budgetRes.data?.ai_budget_monthly_usd ?? 0);
  const fractionUsed = budgetUsd > 0 ? monthToDateUsd / budgetUsd : 0;

  return {
    monthLabel: firstOfMonth.toLocaleDateString('en', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    monthToDateUsd,
    budgetUsd,
    fractionUsed,
    overEightyPct: budgetUsd > 0 && fractionUsed >= 0.8,
    overBudget: budgetUsd > 0 && fractionUsed >= 1,
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    byCapability,
    byModel,
    trend,
    hasAnyUsage: totalCalls > 0 || byCapability.length > 0,
  };
}
