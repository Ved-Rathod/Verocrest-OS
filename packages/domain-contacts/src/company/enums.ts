/** Company size buckets per docs/04 §4.5 company_size_enum. */
export const COMPANY_SIZES = ['solo', 'micro', 'small', 'medium', 'large', 'enterprise'] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

/** Human labels for the size buckets (docs/04 §4.5 comments). */
export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  solo: 'Solo (1)',
  micro: 'Micro (2–9)',
  small: 'Small (10–49)',
  medium: 'Medium (50–249)',
  large: 'Large (250–999)',
  enterprise: 'Enterprise (1000+)',
};
