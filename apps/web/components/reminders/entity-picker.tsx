'use client';

import { useEffect, useRef, useState } from 'react';
import { UserIcon, XIcon } from 'lucide-react';
import { searchReminderEntitiesAction } from '@verocrest/domain-reminders/actions';
import {
  REMINDER_ENTITY_LABELS,
  SELECTABLE_ENTITY_TYPES,
  type EntityOption,
  type SelectableEntityType,
} from '@verocrest/domain-reminders';
import { cn } from '@verocrest/ui-kit';

export type SelectedEntity = {
  type: SelectableEntityType;
  id: string;
  label: string;
  sublabel: string | null;
};

/**
 * Polymorphic entity picker for reminder creation: choose Contact / Lead / Company,
 * then search. CONTROLLED by the parent (LeadForm-style, Sprint 2.3 fix) — the
 * parent owns `value` and renders the hidden entityType/entityId fields, so the
 * selection survives React 19's form-reset-on-action.
 */
export function EntityPicker({
  value,
  onChange,
  error,
}: {
  value: SelectedEntity | null;
  onChange: (entity: SelectedEntity | null) => void;
  error?: string;
}) {
  const [type, setType] = useState<SelectableEntityType>('contact');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntityOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestQuery = useRef('');

  useEffect(() => {
    if (value) return;
    const q = query.trim();
    latestQuery.current = `${type}:${q}`;
    if (q === '') {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const token = `${type}:${q}`;
      const result = await searchReminderEntitiesAction(type, q);
      if (latestQuery.current !== token) return;
      setResults(result.data?.options ?? []);
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, value, type]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      <label htmlFor="entity-picker" className="text-sm font-medium text-fg">
        About <span aria-hidden="true">*</span>
      </label>

      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-edge bg-surface-2 px-3 py-1.5 text-sm">
          <span className="flex min-w-0 items-center gap-2 text-fg">
            <span className="shrink-0 rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted">
              {REMINDER_ENTITY_LABELS[value.type]}
            </span>
            <UserIcon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
            <span className="truncate">{value.label}</span>
            {value.sublabel ? (
              <span className="truncate text-xs text-fg-subtle">{value.sublabel}</span>
            ) : null}
          </span>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => {
              onChange(null);
              setQuery('');
              setResults([]);
            }}
            className="rounded-sm p-0.5 text-fg-muted hover:bg-surface-3 hover:text-fg"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-1" role="tablist" aria-label="Entity type">
            {SELECTABLE_ENTITY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={type === t}
                onClick={() => {
                  setType(t);
                  setQuery('');
                  setResults([]);
                  setOpen(false);
                }}
                className={cn(
                  'rounded-sm border px-2.5 py-1 text-xs font-medium',
                  type === t
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-edge bg-surface-2 text-fg-muted hover:text-fg',
                )}
              >
                {REMINDER_ENTITY_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              id="entity-picker"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              placeholder={`Search ${REMINDER_ENTITY_LABELS[type].toLowerCase()}s…`}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              className={cn(
                'h-9 w-full rounded-sm border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-subtle',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                error ? 'border-danger' : 'border-edge',
              )}
            />
            {open && (loading || query.trim() !== '') ? (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-edge-subtle bg-surface-3 py-1 shadow-lg">
                {loading ? (
                  <li className="px-3 py-2 text-xs text-fg-subtle">Searching…</li>
                ) : results.length > 0 ? (
                  results.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange({ type, id: o.id, label: o.label, sublabel: o.sublabel });
                          setOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
                      >
                        <span className="truncate">{o.label}</span>
                        <span className="truncate text-xs text-fg-subtle">{o.sublabel ?? ''}</span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-xs text-fg-subtle">No matches.</li>
                )}
              </ul>
            ) : null}
          </div>
        </>
      )}

      {error && !value ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
