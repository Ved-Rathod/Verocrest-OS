'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Theme provider per docs/08 §13 — `data-theme` on <html>, dark by default
 * (docs/07 Principle 3), system mode supported. The user-facing toggle location
 * is Settings → Profile (Sprint 3); a top-bar toggle exists meanwhile.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
