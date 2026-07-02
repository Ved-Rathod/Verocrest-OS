'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/**
 * Application shell per docs/07 §3.1 — sidebar + top bar + independently
 * scrolling content region. Owns the mobile drawer state.
 */
export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-canvas">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
