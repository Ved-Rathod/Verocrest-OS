'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Settings sub-navigation (D2, docs/07 §8). A minimal tab bar rendered at the
 * top of the settings surfaces this sprint owns (Workspace + the AI area). The
 * frozen ICP/Offer settings pages are intentionally not wrapped.
 */
const TABS = [
  { label: 'Workspace', href: '/settings/workspace' },
  { label: 'AI Usage', href: '/settings/ai/usage' },
  { label: 'Prompt Library', href: '/settings/ai/prompts' },
  { label: 'Integrations', href: '/settings/integrations' },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex gap-1 border-b border-edge-subtle" aria-label="Settings sections">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active
                ? 'border-primary font-medium text-fg-strong'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
