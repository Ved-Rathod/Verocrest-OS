/**
 * Founder onboarding checklist (docs/05 §3, Sprint 4.6). Per-item completion is
 * DERIVED from presence-probes — no per-item state is stored — which is what
 * makes the checklist resume automatically after an interruption.
 *
 * v0.1 completion (Amendment 007): the six *required* steps below, all of which
 * have shipped surfaces. Revenue Target and Website Audit are shown as
 * `coming_soon` and do NOT block completion (their sprints land later).
 */

export type OnboardingItemStatus = 'done' | 'not_started' | 'coming_soon';

export type OnboardingItemKey =
  | 'google'
  | 'company'
  | 'icp'
  | 'offer'
  | 'knowledge'
  | 'leads'
  | 'revenue_target'
  | 'website_audit';

export type OnboardingItem = {
  key: OnboardingItemKey;
  title: string;
  description: string;
  /** Deep-link to the existing surface that completes the step; null when coming soon. */
  href: string | null;
  cta: string;
  status: OnboardingItemStatus;
  /** Counts toward v0.1 completion (docs/05 §3.9 as amended). */
  required: boolean;
};

export type OnboardingProgress = {
  items: OnboardingItem[];
  requiredTotal: number;
  requiredDone: number;
  /** All required steps done. */
  complete: boolean;
  dismissed: boolean;
  onboardedAt: string | null;
};
