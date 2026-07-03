/** Seniority levels per docs/04 §4.1 (plain text column; validated in-app). */
export const SENIORITY_LEVELS = ['ic', 'manager', 'director', 'vp', 'c_suite', 'owner'] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  ic: 'Individual contributor',
  manager: 'Manager',
  director: 'Director',
  vp: 'VP',
  c_suite: 'C-suite',
  owner: 'Owner',
};
