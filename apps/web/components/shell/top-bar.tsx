'use client';

import { MenuIcon } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';

/**
 * Top bar per docs/07 §3.3 — 48px sticky; breadcrumb/title left, action cluster right.
 * Contextual actions and the notification bell arrive with their modules.
 */
export function TopBar({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-edge-subtle bg-canvas/95 px-4 backdrop-blur">
      <button
        aria-label="Open navigation"
        onClick={onMenuClick}
        className="flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg md:hidden"
      >
        <MenuIcon className="size-4" />
      </button>

      <h1 className="truncate text-sm font-semibold text-fg-strong">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-full bg-surface-3 text-xs font-medium text-fg"
        >
          F
        </span>
      </div>
    </header>
  );
}
