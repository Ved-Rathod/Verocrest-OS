'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { signInWithPassword } from '@verocrest/domain-auth/actions';
import { Button, InputField } from '@verocrest/ui-kit';
import { FormError } from './form-error';
import { GoogleButton } from './google-button';

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(signInWithPassword, null);

  const next = searchParams.get('next') ?? '/';
  const linkError = searchParams.get('error');

  useEffect(() => {
    if (state?.data?.user) {
      // Only same-origin relative paths (guards the ?next= param).
      const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/';
      router.push(safe);
      router.refresh();
    }
  }, [state, next, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold text-fg-strong">Sign in</h1>
        <p className="mt-1 text-sm text-fg-muted">Welcome back.</p>
      </div>

      {linkError === 'link_invalid' ? (
        <FormError message="That link is invalid or has expired. Sign in, or request a new one." />
      ) : null}
      {state?.error && !state.error.fieldErrors ? (
        <FormError message={state.error.message} />
      ) : null}

      <InputField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state?.error?.fieldErrors?.['email']}
      />
      <InputField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state?.error?.fieldErrors?.['password']}
      />

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-edge-subtle" />
        <span className="text-xs text-fg-subtle">or</span>
        <span className="h-px flex-1 bg-edge-subtle" />
      </div>

      <GoogleButton />

      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-fg-muted hover:text-fg">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-medium text-primary hover:text-primary-hover">
          Create account
        </Link>
      </div>
    </form>
  );
}
