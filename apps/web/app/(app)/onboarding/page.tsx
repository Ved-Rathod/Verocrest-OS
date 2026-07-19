import type { Metadata } from 'next';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { getOnboardingProgress, markWorkspaceOnboarded } from '@verocrest/domain-auth/server';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';

export const metadata: Metadata = { title: 'Setup' };
export const dynamic = 'force-dynamic';

/**
 * Onboarding checklist surface (docs/05 §3, docs/07 §9). Full-region while
 * incomplete. Completion is derived from presence-probes; when the required
 * steps first all pass we stamp the workspace + emit workspace.onboarded once,
 * then show the quiet celebration.
 */
export default async function OnboardingPage() {
  const ctx = await requireWorkspaceContext();
  const progress = await getOnboardingProgress(ctx);

  let justCompleted = false;
  if (progress.complete && !progress.onboardedAt) {
    justCompleted = await markWorkspaceOnboarded(ctx, progress.requiredDone);
  }

  return (
    <div className="p-4 lg:p-6">
      <OnboardingChecklist progress={progress} justCompleted={justCompleted} />
    </div>
  );
}
