'use client';

import { useActionState } from 'react';
import { analyzeWebsiteAction } from '@verocrest/domain-website-intelligence/actions';
import { Button, InputField } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';
import { unmappedFieldErrors } from '@/components/forms/form-errors';

/**
 * Analyze / Refresh a website (Sprint 4.8). Runs the deterministic analyzer via a
 * Server Action; on success it redirects to the new results page (each run is a
 * new audit row → history preserved).
 */
export function AnalyzeForm({
  defaultUrl,
  submitLabel = 'Analyze',
}: {
  defaultUrl?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(analyzeWebsiteAction, null);
  const fieldErrors = state?.error?.fieldErrors;
  const bannerErrors = unmappedFieldErrors(fieldErrors, ['url']);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {state?.error && (!fieldErrors || bannerErrors.length > 0) ? (
        <FormError
          message={bannerErrors.length > 0 ? bannerErrors.join(' ') : state.error.message}
        />
      ) : null}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <InputField
            label="Website URL"
            name="url"
            defaultValue={defaultUrl ?? ''}
            placeholder="https://example.com"
            error={fieldErrors?.['url']}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Analyzing…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
