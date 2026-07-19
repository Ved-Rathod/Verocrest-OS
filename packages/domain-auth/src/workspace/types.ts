import { z } from 'zod';

/** Roles per docs/04 §3.2 — MVP uses owner + member; admin/guest are Phase 3. */
export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'guest'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Currencies supported at launch per FR-FIN-008 (docs/02 §4.13). */
export const WORKSPACE_CURRENCIES = ['AUD', 'CAD', 'GBP', 'NZD', 'EUR', 'USD', 'AED'] as const;

/** Raw row shape from Postgres (snake_case) — parsed, never trusted blindly. */
export const workspaceRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  timezone: z.string(),
  default_currency: z.string().length(3),
  locale: z.string(),
  plan: z.string(),
  created_at: z.string(),
  onboarded_at: z.string().nullable().optional(),
});

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  defaultCurrency: string;
  locale: string;
  plan: string;
  createdAt: string;
  /** Set once the onboarding checklist first reaches completion (docs/05 §3.9). */
  onboardedAt: string | null;
};

export type WorkspaceMembership = Workspace & { role: WorkspaceRole };

export function toWorkspace(row: z.infer<typeof workspaceRowSchema>): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    timezone: row.timezone,
    defaultCurrency: row.default_currency,
    locale: row.locale,
    plan: row.plan,
    createdAt: row.created_at,
    onboardedAt: row.onboarded_at ?? null,
  };
}
