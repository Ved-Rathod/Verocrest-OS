'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { authErrors } from '../errors';
import { fail, ok, type ActionResult } from '../result';
import { toFieldErrors } from '../validation';
import { ACTIVE_WORKSPACE_COOKIE, requireMembership } from './service';
import { toWorkspace, workspaceRowSchema, type Workspace } from './types';
import { workspaceSettingsSchema } from './validation';

/**
 * Workspace Server Actions per docs/10 §5.8. Deferred to the platform-db
 * sprint: action_log writes (FR-SET-003) — the table lands with Drizzle infra.
 */

/** Switch the active workspace (docs/10 §5.8.2) — validates membership first. */
export async function switchWorkspace(workspaceId: string): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(workspaceId);
  if (!parsed.success) {
    return fail(authErrors.validation({ workspaceId: 'Invalid workspace id' }));
  }

  try {
    await requireMembership(parsed.data);
  } catch {
    return fail({
      code: 'WORKSPACE_NOT_MEMBER',
      category: 'authorization',
      message: 'You are not a member of that workspace.',
      retryable: false,
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30d, matching the session's absolute lifetime
  });

  revalidatePath('/', 'layout');
  return ok({ id: parsed.data });
}

/** Update workspace settings — owner-only, enforced by RLS itself (docs/04 §21). */
export async function updateWorkspaceSettings(
  _prev: ActionResult<{ workspace: Workspace }> | null,
  formData: FormData,
): Promise<ActionResult<{ workspace: Workspace }>> {
  const workspaceId = z.string().uuid().safeParse(formData.get('workspaceId'));
  if (!workspaceId.success) {
    return fail(authErrors.validation({ workspaceId: 'Invalid workspace id' }));
  }

  const input = workspaceSettingsSchema.safeParse({
    name: formData.get('name'),
    timezone: formData.get('timezone'),
    defaultCurrency: formData.get('defaultCurrency'),
  });
  if (!input.success) return fail(authErrors.validation(toFieldErrors(input.error)));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('workspaces')
    .update({
      name: input.data.name,
      timezone: input.data.timezone,
      default_currency: input.data.defaultCurrency,
    })
    .eq('id', workspaceId.data)
    .select('id, slug, name, timezone, default_currency, locale, plan, created_at')
    .single();

  if (error || !data) {
    // RLS returning zero rows means: not a member, or member but not owner.
    return fail({
      code: 'ROLE_INSUFFICIENT',
      category: 'authorization',
      message: 'Only the workspace owner can change these settings.',
      retryable: false,
    });
  }

  const row = workspaceRowSchema.safeParse(data);
  if (!row.success) return fail(authErrors.internal());

  revalidatePath('/', 'layout');
  return ok({ workspace: toWorkspace(row.data) });
}
