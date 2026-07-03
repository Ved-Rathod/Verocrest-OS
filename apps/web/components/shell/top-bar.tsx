'use client';

import { usePathname } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import type { ShellUser } from './sidebar';
import { ThemeToggle } from './theme-toggle';

/**
 * Top bar per docs/07 §3.3 — 48px sticky; title left, action cluster right.
 * Titles are route-derived; the full breadcrumb model arrives with entity
 * detail pages (docs/07 §3.4).
 */
const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/settings/workspace': 'Workspace Settings',
  '/companies': 'Companies',
  '/companies/new': 'New Company',
};

function titleFor(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/companies/') && pathname.endsWith('/edit')) return 'Edit Company';
  if (pathname.startsWith('/companies')) return 'Companies';
  return 'Verocrest OS';
}

export function TopBar({ user, onMenuClick }: { user: ShellUser; onMenuClick: () => void }) {
  const pathname = usePathname();
  const title = titleFor(pathname);
  const initial = (user.displayName ?? user.email ?? '?').charAt(0).toUpperCase();

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
          title={user.email ?? undefined}
          className="flex size-7 items-center justify-center rounded-full bg-surface-3 text-xs font-medium text-fg"
        >
          {initial}
        </span>
      </div>
    </header>
  );
}
