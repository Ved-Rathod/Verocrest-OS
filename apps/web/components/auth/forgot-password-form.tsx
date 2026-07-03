'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset } from '@verocrest/domain-auth/actions';
import { Button, InputField } from '@verocrest/ui-kit';
import { MailCheckIcon } from 'lucide-react';
import { FormError } from './form-error';

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, null);

  if (state?.data?.sent) {
    // Anti-enumeration: identical response whether or not the account exists (docs/10 §5.4).
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <MailCheckIcon aria-hidden="true" className="size-8 text-success" strokeWidth={1.75} />
        <h1 className="text-xl font-semibold text-fg-strong">Check your email</h1>
        <p className="max-w-sm text-sm text-fg-muted">
          If an account exists for that address, a reset link is on its way. If it hasn&apos;t
          arrived in 5 minutes, check spam.
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
        <h1 className="text-xl font-semibold text-fg-strong">Reset your password</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Enter your email and we&apos;ll send a reset link.
        </p>
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

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>

      <p className="text-center text-sm text-fg-muted">
        Remembered it?{' '}
        <Link href="/signin" className="font-medium text-primary hover:text-primary-hover">
          Sign in
        </Link>
      </p>
    </form>
  );
}
