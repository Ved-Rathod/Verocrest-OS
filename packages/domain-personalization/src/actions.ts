'use server';

import { revalidatePath } from 'next/cache';
import { requireWorkspaceContext, WorkspaceContextError } from '@verocrest/platform-tenancy/server';
import { fail, ok, type ActionResult } from '@verocrest/platform-tenancy';
import { generatePersonalization } from './personalization/service';
import { ContactNotFoundError } from './personalization/grounding';
import { generatePersonalizationInputSchema } from './personalization/validation';
import type { Personalization } from './personalization/types';

/**
 * Personalization Server Action (Milestone M4). Validates, delegates to the
 * service (Router call → persist → emit `outreach.draft.generated`), revalidates
 * the contact page, and returns the generated personalization.
 */
export async function generatePersonalizationAction(
  _prev: ActionResult<{ personalization: Personalization }> | null,
  formData: FormData,
): Promise<ActionResult<{ personalization: Personalization }>> {
  const parsed = generatePersonalizationInputSchema.safeParse({
    contactId: formData.get('contactId'),
  });
  if (!parsed.success) {
    return fail({
      code: 'VALIDATION_ERROR',
      category: 'validation',
      message: 'A valid contact is required.',
      retryable: false,
    });
  }

  try {
    const ctx = await requireWorkspaceContext();
    const personalization = await generatePersonalization(ctx, parsed.data.contactId);
    revalidatePath(`/contacts/${parsed.data.contactId}`);
    return ok({ personalization });
  } catch (err) {
    if (err instanceof WorkspaceContextError) {
      return fail({
        code: 'WORKSPACE_NOT_MEMBER',
        category: 'authorization',
        message: 'Please sign in.',
        retryable: false,
      });
    }
    if (err instanceof ContactNotFoundError) {
      return fail({
        code: 'NOT_FOUND',
        category: 'business',
        message: 'Contact not found.',
        retryable: false,
      });
    }
    console.error('[personalization] generate failed', err);
    return fail({
      code: 'INTERNAL',
      category: 'ai',
      message: 'Personalization could not be generated. Try again.',
      retryable: true,
    });
  }
}
