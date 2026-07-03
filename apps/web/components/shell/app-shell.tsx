'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar, type ShellUser } from './sidebar';
import { TopBar } from './top-bar';

/**
 * Application shell per docs/07 §3.1 — sidebar + top bar + independently
 * scrolling content region. Owns the mobile drawer state. Workspace state
 * comes from WorkspaceProvider (wrapped by the (app) layout).
 */
export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-canvas">
      <Sidebar user={user} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
