'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { WorkspaceMembership } from '@verocrest/domain-auth';

type WorkspaceContextValue = {
  /** The active workspace for this session (docs/03 §4.1). */
  active: WorkspaceMembership;
  /** All live memberships — the switcher lists these (one now, many later). */
  memberships: WorkspaceMembership[];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** Server-resolved workspace state, made available to client components. */
export function WorkspaceProvider({
  active,
  memberships,
  children,
}: WorkspaceContextValue & { children: ReactNode }) {
  return (
    <WorkspaceContext.Provider value={{ active, memberships }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used inside <WorkspaceProvider> (the (app) layout).');
  }
  return ctx;
}
