import { z } from 'zod';

/** company_size_enum (docs/04 §4.5). */
export const COMPANY_SIZES = ['solo', 'micro', 'small', 'medium', 'large', 'enterprise'] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

/** Row shape returned from Supabase (snake_case), validated before mapping. */
export const icpRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  short_description: z.string().nullable(),
  narrative: z.string(),
  criteria: z.record(z.string(), z.unknown()),
  disqualifiers: z.array(z.string()),
  target_geographies: z.array(z.string()),
  target_industries: z.array(z.string()),
  target_size: z.array(z.enum(COMPANY_SIZES)),
  target_revenue_min: z.union([z.number(), z.string()]).nullable(),
  target_revenue_max: z.union([z.number(), z.string()]).nullable(),
  target_revenue_currency: z.string().nullable(),
  active: z.boolean(),
  is_primary: z.boolean(),
  version: z.number().int(),
  is_indexed: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Icp = {
  id: string;
  name: string;
  shortDescription: string | null;
  narrative: string;
  disqualifiers: string[];
  targetGeographies: string[];
  targetIndustries: string[];
  targetSize: CompanySize[];
  targetRevenueMin: number | null;
  targetRevenueMax: number | null;
  targetRevenueCurrency: string | null;
  active: boolean;
  isPrimary: boolean;
  version: number;
  isIndexed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IcpListItem = Pick<
  Icp,
  'id' | 'name' | 'shortDescription' | 'active' | 'isPrimary' | 'isIndexed' | 'updatedAt'
>;

function numOrNull(v: number | string | null): number | null {
  if (v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toIcp(row: z.infer<typeof icpRowSchema>): Icp {
  return {
    id: row.id,
    name: row.name,
    shortDescription: row.short_description,
    narrative: row.narrative,
    disqualifiers: row.disqualifiers,
    targetGeographies: row.target_geographies,
    targetIndustries: row.target_industries,
    targetSize: row.target_size,
    targetRevenueMin: numOrNull(row.target_revenue_min),
    targetRevenueMax: numOrNull(row.target_revenue_max),
    targetRevenueCurrency: row.target_revenue_currency,
    active: row.active,
    isPrimary: row.is_primary,
    version: row.version,
    isIndexed: row.is_indexed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const ICP_SELECT =
  'id, name, short_description, narrative, criteria, disqualifiers, target_geographies, target_industries, target_size, target_revenue_min, target_revenue_max, target_revenue_currency, active, is_primary, version, is_indexed, created_at, updated_at';
