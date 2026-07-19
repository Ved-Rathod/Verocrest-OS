import { z } from 'zod';

/** Frozen target periods (docs/04 §13.2 `target_period_enum`). */
export const TARGET_PERIODS = ['monthly', 'quarterly', 'annual'] as const;
export type TargetPeriod = (typeof TARGET_PERIODS)[number];

export const TARGET_PERIOD_LABELS: Record<TargetPeriod, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Yearly',
};

export type Target = {
  id: string;
  period: TargetPeriod;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  revenueTarget: number;
  currency: string;
  meetingsTarget: number | null;
  replyRateTarget: number | null;
  isIndexed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TargetListItem = Pick<
  Target,
  'id' | 'period' | 'periodStart' | 'periodEnd' | 'revenueTarget' | 'currency' | 'isIndexed'
>;

const numOrNull = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((v) => {
    if (v === null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

export const targetRowSchema = z.object({
  id: z.string().uuid(),
  period: z.enum(TARGET_PERIODS),
  period_start: z.string(),
  period_end: z.string(),
  revenue_target: numOrNull,
  currency: z.string(),
  meetings_target: numOrNull,
  reply_rate_target: numOrNull,
  is_indexed: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export function toTarget(row: z.infer<typeof targetRowSchema>): Target {
  return {
    id: row.id,
    period: row.period,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    revenueTarget: row.revenue_target ?? 0,
    currency: row.currency,
    meetingsTarget: row.meetings_target,
    replyRateTarget: row.reply_rate_target,
    isIndexed: row.is_indexed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const TARGET_SELECT =
  'id, period, period_start, period_end, revenue_target, currency, meetings_target, reply_rate_target, is_indexed, created_at, updated_at';

/** Whether today falls within the target's period (docs/04 §13.2; Sprint 4.7 D5). */
export function isCurrent(
  target: Pick<Target, 'periodStart' | 'periodEnd'>,
  today = new Date(),
): boolean {
  const day = today.toISOString().slice(0, 10);
  return target.periodStart <= day && day <= target.periodEnd;
}
