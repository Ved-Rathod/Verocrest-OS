'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchIcon, XIcon } from 'lucide-react';
import { Badge, cn } from '@verocrest/ui-kit';
import { primaryNav, secondaryNav, type NavItem } from './nav-items';

/**
 * Sidebar per docs/07 §3.2 — workspace switcher, search affordance, fixed-order
 * primary nav, secondary section, user menu. 240px desktop / 64px icon rail on
 * tablet / overlay drawer on mobile (docs/07 §14.1).
 */
export function Sidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-overlay md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={cn(
          'z-50 flex h-dvh flex-col border-r border-edge-subtle bg-surface',
          // Desktop: fixed 240px. Tablet: 64px icon rail. Mobile: hidden unless drawer open.
          'fixed inset-y-0 left-0 w-60 transition-transform md:static md:translate-x-0',
          'md:w-16 lg:w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Workspace switcher (07 §3.5) — static until workspaces land in Sprint 2 */}
        <div className="flex h-12 items-center gap-2.5 border-b border-edge-subtle px-3">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-fg-on-primary"
          >
            V
          </span>
          <span className="truncate font-semibold text-fg-strong md:hidden lg:inline">
            Verocrest
          </span>
          <Badge variant="neutral" className="md:hidden lg:inline-flex">
            owner
          </Badge>
          <button
            aria-label="Close navigation"
            className="ml-auto rounded-sm p-1 text-fg-muted hover:bg-surface-2 md:hidden"
            onClick={onMobileClose}
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Search affordance — opens the command palette when it lands (Sprint 3) */}
        <div className="px-3 pt-3">
          <button
            disabled
            title="Command palette lands in Sprint 3"
            className="flex w-full items-center gap-2 rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-left text-fg-subtle disabled:cursor-not-allowed"
          >
            <SearchIcon className="size-4 shrink-0" />
            <span className="flex-1 truncate text-sm md:hidden lg:inline">Search</span>
            <kbd className="rounded-xs border border-edge px-1 font-mono text-xs md:hidden lg:inline">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Primary navigation — fixed order per docs/07 §2.1 */}
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {primaryNav.map((item) => (
              <li key={item.label}>
                <NavEntry item={item} onNavigate={onMobileClose} />
              </li>
            ))}
          </ul>

          <div className="my-3 border-t border-edge-subtle" aria-hidden="true" />

          <ul className="space-y-0.5">
            {secondaryNav.map((item) => (
              <li key={item.label}>
                <NavEntry item={item} onNavigate={onMobileClose} />
              </li>
            ))}
          </ul>
        </nav>

        {/* User menu placeholder — real menu lands with auth (Sprint 2) */}
        <div className="border-t border-edge-subtle p-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-medium text-fg"
            >
              F
            </span>
            <div className="min-w-0 md:hidden lg:block">
              <p className="truncate text-sm font-medium text-fg">Founder</p>
              <p className="truncate text-xs text-fg-subtle">Sign-in lands in Sprint 2</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function NavEntry({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const Icon = item.icon;

  const baseClasses =
    'relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors';

  if (!item.href) {
    // Gated item (docs/07 §9.6) — disabled always explains why.
    return (
      <button
        disabled
        title={`${item.label} lands in ${item.landsIn}`}
        className={cn(baseClasses, 'cursor-not-allowed text-fg-subtle')}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left md:hidden lg:inline">{item.label}</span>
        <span className="text-[10px] text-fg-subtle md:hidden lg:inline">soon</span>
      </button>
    );
  }

  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        baseClasses,
        active ? 'bg-primary-subtle font-medium text-fg-strong' : 'text-fg hover:bg-surface-2',
      )}
    >
      {/* Active left bar per docs/07 §3.2 */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate md:hidden lg:inline">{item.label}</span>
    </Link>
  );
}
