'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hasClientEnv } from '@verocrest/config';
import {
  createSupabaseServerClient,
  getAuthUser,
} from '@verocrest/platform-integrations/supabase/server';
import type { AuthUser } from '@verocrest/platform-integrations/supabase/types';
import { authErrors, mapSupabaseAuthError } from './errors';
import { isPasswordBreached } from './hibp';
import { fail, ok, type ActionResult } from './result';
import {
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  toFieldErrors,
  updatePasswordSchema,
} from './validation';

/**
 * Authentication Server Actions per docs/10 §3.1 + §5. Every mutation returns
 * the docs/10 §10 envelope; redirects happen in the form components on success
 * so error states stay inline (docs/07 §7.1).
 *
 * Deferred (needs the database sprint): FR-IDT-008 action_log writes,
 * DB-backed rate limiting (Supabase Auth's built-in limits cover the interim).
 */

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

export async function signUpWithPassword(
  _prev: ActionResult<{ verificationSent: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ verificationSent: boolean }>> {
  if (!hasClientEnv()) return fail(authErrors.configMissing());

  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return fail(authErrors.validation(toFieldErrors(parsed.error)));

  if (await isPasswordBreached(parsed.data.password)) {
    return fail(authErrors.passwordBreached());
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${await requestOrigin()}/auth/callback?next=/` },
  });
  if (error) return fail(mapSupabaseAuthError(error));

  // Supabase signals an existing confirmed account with an empty identities array
  // rather than an error (anti-enumeration); we translate per F-ONB-001.
  if (data.user && data.user.identities?.length === 0) {
    return fail(authErrors.emailExists());
  }

  return ok({ verificationSent: true });
}

export async function signInWithPassword(
  _prev: ActionResult<{ user: AuthUser }> | null,
  formData: FormData,
): Promise<ActionResult<{ user: AuthUser }>> {
  if (!hasClientEnv()) return fail(authErrors.configMissing());

  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return fail(authErrors.validation(toFieldErrors(parsed.error)));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return fail(mapSupabaseAuthError(error));

  const user = await getAuthUser();
  if (!user) return fail(authErrors.internal());
  return ok({ user });
}

export async function signOut(): Promise<never> {
  if (hasClientEnv()) {
    const supabase = await createSupabaseServerClient();
    // Server-side invalidation per FR-IDT-011 — not just cookie clearing.
    await supabase.auth.signOut();
  }
  redirect('/signin');
}

export async function requestPasswordReset(
  _prev: ActionResult<{ sent: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ sent: boolean }>> {
  if (!hasClientEnv()) return fail(authErrors.configMissing());

  const parsed = resetRequestSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return fail(authErrors.validation(toFieldErrors(parsed.error)));

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await requestOrigin()}/auth/callback?next=/reset-password`,
  });

  // Always success — never disclose whether the email exists (docs/10 §5.4).
  return ok({ sent: true });
}

export async function updatePassword(
  _prev: ActionResult<{ updated: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: boolean }>> {
  if (!hasClientEnv()) return fail(authErrors.configMissing());

  const parsed = updatePasswordSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) return fail(authErrors.validation(toFieldErrors(parsed.error)));

  if (await isPasswordBreached(parsed.data.password)) {
    return fail(authErrors.passwordBreached());
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(mapSupabaseAuthError(error));

  return ok({ updated: true });
}
