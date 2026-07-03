'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2Icon, XIcon } from 'lucide-react';
import { searchCompaniesForPickerAction } from '@verocrest/domain-contacts/actions';
import type { CompanyOption } from '@verocrest/domain-contacts';
import { cn } from '@verocrest/ui-kit';

/**
 * Company picker (docs/06 §3 relationship). Type-to-search combobox backed by
 * searchCompaniesForPickerAction; selecting sets a hidden companyId field the
 * contact form submits. Company creation lives on /companies (link provided).
 */
export function CompanyPicker({
  name = 'companyId',
  initial,
}: {
  name?: string;
  initial?: { id: string; name: string } | null;
}) {
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(initial ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestQuery = useRef('');

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    latestQuery.current = q;
    if (q === '') {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await searchCompaniesForPickerAction(q);
      if (latestQuery.current !== q) return; // stale response
      setResults(result.data?.options ?? []);
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      <label htmlFor="company-picker" className="text-sm font-medium text-fg">
        Company
      </label>
      <input type="hidden" name={name} value={selected?.id ?? ''} />

      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-edge bg-surface-2 px-3 py-1.5 text-sm">
          <span className="flex items-center gap-2 text-fg">
            <Building2Icon className="size-4 text-fg-muted" strokeWidth={1.75} />
            {selected.name}
          </span>
          <button
            type="button"
            aria-label="Clear company"
            onClick={() => {
              setSelected(null);
              setQuery('');
              setResults([]);
            }}
            className="rounded-sm p-0.5 text-fg-muted hover:bg-surface-3 hover:text-fg"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id="company-picker"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search companies…"
            autoComplete="off"
            className="h-9 w-full rounded-sm border border-edge bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
          {open && (loading || results.length > 0 || query.trim() !== '') ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-edge-subtle bg-surface-3 py-1 shadow-lg">
              {loading ? (
                <li className="px-3 py-2 text-xs text-fg-subtle">Searching…</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-fg-subtle">
                  No matches.{' '}
                  <a href="/companies/new" className="text-primary hover:text-primary-hover">
                    Create a company
                  </a>
                </li>
              ) : (
                results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected({ id: c.id, name: c.name });
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-2',
                      )}
                    >
                      <span>{c.name}</span>
                      {c.domain ? <span className="text-xs text-fg-subtle">{c.domain}</span> : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}
      <p className="text-xs text-fg-muted">Optional. Links this contact to an existing company.</p>
    </div>
  );
}
