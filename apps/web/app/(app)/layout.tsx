import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';

// Authenticated-surface layout group. Auth guard arrives in Sprint 2;
// public routes (signup, booking) will live outside this group per docs/07 §6.8.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell title="Dashboard">{children}</AppShell>;
}
