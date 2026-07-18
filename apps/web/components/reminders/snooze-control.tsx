'use client';

import { useEffect, useRef, useState } from 'react';
import { AlarmClockIcon } from 'lucide-react';
import { SNOOZE_PRESETS } from '@verocrest/domain-reminders';
import { cn } from '@verocrest/ui-kit';

function presetIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/**
 * Snooze popover — 1d / 3d / 1w presets + a custom date/time (docs/06 §6).
 * Emits the chosen instant as an ISO string; the caller runs the Server Action.
 */
export function SnoozeControl({
  onSnooze,
  disabled,
  compact,
}: {
  onSnooze: (untilIso: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function choose(iso: string) {
    setOpen(false);
    setCustom('');
    onSnooze(iso);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        aria-label="Snooze reminder"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm text-fg-muted hover:bg-surface-3 hover:text-fg disabled:opacity-40',
          compact ? 'p-1.5' : 'h-9 border border-edge bg-surface-2 px-3 text-sm',
        )}
      >
        <AlarmClockIcon className="size-4" strokeWidth={1.75} />
        {compact ? null : 'Snooze'}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-edge-subtle bg-surface-3 p-2 shadow-lg">
          <div className="flex flex-col gap-1">
            {SNOOZE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => choose(presetIso(p.days))}
                className="rounded-sm px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2 border-t border-edge-subtle pt-2">
            <label className="mb-1 block text-xs text-fg-muted">Custom</label>
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-8 w-full rounded-sm border border-edge bg-surface-2 px-2 text-xs text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            <button
              type="button"
              disabled={!custom}
              onClick={() => {
                const d = new Date(custom);
                if (!Number.isNaN(d.getTime())) choose(d.toISOString());
              }}
              className="mt-1.5 w-full rounded-sm bg-primary px-2 py-1 text-xs font-medium text-fg-on-primary hover:bg-primary-hover disabled:opacity-40"
            >
              Snooze until
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
