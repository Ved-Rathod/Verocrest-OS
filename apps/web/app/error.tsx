'use client';

import { useEffect } from 'react';

/**
 * Global error boundary per docs/07 §9.3. Copy per docs/08 §14 (global fallback):
 * state the fact, offer retry, expose the reference id. Sentry wiring lands in
 * Sprint 1.4 with the observability skeleton.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sprint 1.4 replaces this with the structured logger + Sentry capture.
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <h1 className="text-xl font-semibold text-fg-strong">Something didn&apos;t go through</h1>
      <p className="max-w-sm text-sm text-fg-muted">
        We&apos;ve logged it — try again.
        {error.digest ? (
          <>
            {' '}
            Reference: <code className="font-mono text-xs">{error.digest}</code>
          </>
        ) : null}
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-fg-on-primary transition-colors hover:bg-primary-hover"
      >
        Try again
      </button>
    </div>
  );
}
