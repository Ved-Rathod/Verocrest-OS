'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';

const ORDER = ['dark', 'light', 'system'] as const;

/**
 * Theme cycle toggle (dark → light → system). Its permanent home is
 * Settings → Profile (docs/08 §13), landing in Sprint 3; it lives in the
 * top bar meanwhile so both modes stay verifiable.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Theme is unknowable server-side; render a stable placeholder until mounted.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span aria-hidden="true" className="size-8 rounded-md" />;
  }

  const current = (ORDER as readonly string[]).includes(theme ?? '') ? (theme as string) : 'dark';
  const next =
    ORDER[(ORDER.indexOf(current as (typeof ORDER)[number]) + 1) % ORDER.length] ?? 'dark';
  const Icon = current === 'dark' ? MoonIcon : current === 'light' ? SunIcon : MonitorIcon;

  return (
    <button
      aria-label={`Theme: ${current}. Switch to ${next}.`}
      title={`Theme: ${current} — click for ${next}`}
      onClick={() => setTheme(next)}
      className="flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Icon className="size-4" />
    </button>
  );
}
