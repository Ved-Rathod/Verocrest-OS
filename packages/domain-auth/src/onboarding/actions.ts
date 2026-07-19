'use server';

import { revalidatePath } from 'next/cache';
import { requireWorkspaceContext } from '@verocrest/platform-tenancy/server';
import { dismissOnboarding } from './service';

/**
 * Dismiss the onboarding takeover (docs/05 §3). After this the checklist never
 * blocks navigation; it stays reachable via the Onboarding nav item while the
 * workspace is not yet onboarded.
 */
export async function dismissOnboardingAction(): Promise<void> {
  const ctx = await requireWorkspaceContext();
  await dismissOnboarding(ctx);
  revalidatePath('/onboarding');
  revalidatePath('/');
}
