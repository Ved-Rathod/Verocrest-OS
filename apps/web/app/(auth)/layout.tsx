import type { ReactNode } from 'react';

// Public-page chrome per docs/07 §6.8 — centered card, no sidebar, 480px max.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-md bg-primary font-semibold text-fg-on-primary"
        >
          V
        </span>
        <span className="text-lg font-semibold text-fg-strong">Verocrest OS</span>
      </div>
      <div className="w-full max-w-[480px] rounded-lg border border-edge-subtle bg-surface p-6 shadow-lg">
        {children}
      </div>
    </div>
  );
}
