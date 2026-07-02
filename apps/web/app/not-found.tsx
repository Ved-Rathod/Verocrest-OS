import Link from 'next/link';

// Full-page not-found per docs/07 §9.3. Copy voice per docs/07 §16 —
// what happened, then what to do.
export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <p className="font-mono text-sm text-fg-subtle">404</p>
      <h1 className="text-xl font-semibold text-fg-strong">This page doesn&apos;t exist</h1>
      <p className="max-w-sm text-sm text-fg-muted">
        The address may be mistyped, or the page hasn&apos;t been built yet.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-fg-on-primary transition-colors hover:bg-primary-hover"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
