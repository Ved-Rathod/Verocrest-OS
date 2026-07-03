'use client';

import { useEffect } from 'react';
import { Button } from '@verocrest/ui-kit';

// Route error boundary per docs/07 §9.3 — fact + retry + reference id.
export default function CompaniesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sprint 1.4 note: replaced by structured logger + Sentry with observability.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-3 p-10 text-center">
      <h1 className="text-lg font-semibold text-fg-strong">Couldn’t load companies</h1>
      <p className="max-w-sm text-sm text-fg-muted">
        We’ve logged it — try again.
        {error.digest ? (
          <>
            {' '}
            Reference: <code className="font-mono text-xs">{error.digest}</code>
          </>
        ) : null}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
