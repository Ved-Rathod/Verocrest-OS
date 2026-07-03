'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Badge, cn } from '@verocrest/ui-kit';
import { switchWorkspace } from '@verocrest/domain-auth/workspace/actions';
import { useWorkspace } from '@/components/workspace/workspace-provider';

/**
 * Workspace switcher per docs/07 §3.5 — supports one workspace today,
 * multiple later (FR-WS-001/003); the list is already membership-driven.
 */
export function WorkspaceSwitcher() {
  const { active, memberships } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function select(workspaceId: string) {
    if (workspaceId === active.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await switchWorkspace(workspaceId);
      setOpen(false);
      if (result.data) router.refresh();
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center gap-2.5 border-b border-edge-subtle px-3 text-left transition-colors hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-fg-on-primary"
        >
          {active.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 md:hidden lg:block">
          <span className="block truncate text-sm font-semibold text-fg-strong">{active.name}</span>
        </span>
        <Badge variant="neutral" className="md:hidden lg:inline-flex">
          {active.role}
        </Badge>
        <ChevronsUpDownIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-fg-subtle md:hidden lg:block"
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Switch workspace"
          className="absolute inset-x-2 top-full z-50 mt-1 rounded-md border border-edge bg-surface-3 py-1 shadow-lg"
        >
          {memberships.map((m) => (
            <li key={m.id}>
              <button
                role="option"
                aria-selected={m.id === active.id}
                onClick={() => select(m.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-2',
                  m.id === active.id ? 'text-fg-strong' : 'text-fg',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="text-xs text-fg-subtle">{m.role}</span>
                {m.id === active.id ? (
                  <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                ) : null}
              </button>
            </li>
          ))}
          <li className="mt-1 border-t border-edge-subtle px-3 pb-1 pt-1.5 text-xs text-fg-subtle">
            Creating additional workspaces lands in a later sprint.
          </li>
        </ul>
      ) : null}
    </div>
  );
}
