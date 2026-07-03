'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signUpWithPassword } from '@verocrest/domain-auth/actions';
import { Button, InputField } from '@verocrest/ui-kit';
import { MailCheckIcon } from 'lucide-react';
import { FormError } from './form-error';
import { GoogleButton } from './google-button';

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpWithPassword, null);

  if (state?.data?.verificationSent) {
    // Post-signup verification state per docs/05 §2.1.
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <MailCheckIcon aria-hidden="true" className="size-8 text-success" strokeWidth={1.75} />
        <h1 className="text-xl font-semibold text-fg-strong">Check your email</h1>
        <p className="max-w-sm text-sm text-fg-muted">
          We sent a verification link to your address. If it hasn&apos;t arrived in 5 minutes, check
          spam.
        </p>
        <Link
          href="/signin"
          className="mt-2 text-sm font-medium text-primary hover:text-primary-hover"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold text-fg-strong">Create your account</h1>
        <p className="mt-1 text-sm text-fg-muted">Verocrest OS — the client acquisition engine.</p>
      </div>

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
        autoComplete="new-password"
        required
        help="At least 12 characters. Checked against known breaches."
        error={state?.error?.fieldErrors?.['password']}
      />

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-edge-subtle" />
        <span className="text-xs text-fg-subtle">or</span>
        <span className="h-px flex-1 bg-edge-subtle" />
      </div>

      <GoogleButton label="Sign up with Google" />

      <p className="text-center text-sm text-fg-muted">
        Already have an account?{' '}
        <Link href="/signin" className="font-medium text-primary hover:text-primary-hover">
          Sign in
        </Link>
      </p>
    </form>
  );
}
