'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { updatePassword } from '@verocrest/domain-auth/actions';
import { Button, InputField } from '@verocrest/ui-kit';
import { FormError } from './form-error';

export function ResetPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updatePassword, null);

  useEffect(() => {
    if (state?.data?.updated) {
      router.push('/');
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold text-fg-strong">Set a new password</h1>
        <p className="mt-1 text-sm text-fg-muted">
          You&apos;re signed in via your reset link — choose a new password to finish.
        </p>
      </div>

      {state?.error && !state.error.fieldErrors ? (
        <FormError message={state.error.message} />
      ) : null}

      <InputField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        help="At least 12 characters. Checked against known breaches."
        error={state?.error?.fieldErrors?.['password']}
      />

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
