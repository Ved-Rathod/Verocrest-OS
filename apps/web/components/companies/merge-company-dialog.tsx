'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Building2Icon, XIcon } from 'lucide-react';
import {
  mergeCompaniesAction,
  searchCompaniesForPickerAction,
} from '@verocrest/domain-contacts/actions';
import type { CompanyOption } from '@verocrest/domain-contacts';
import { Button, cn } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';

/**
 * Merge dialog (docs/10 §6.1.7). Pick a SURVIVOR company; on submit the action
 * atomically re-parents this company's contacts + leads into it and archives
 * this one, then redirects SERVER-SIDE to the survivor (no client success
 * handling needed — the redirect navigates). Owner-only is enforced in the
 * action + rpc; this dialog only renders for owners.
 */
export function MergeCompanyDialog({
  source,
  onClose,
}: {
  source: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState(mergeCompaniesAction, null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<CompanyOption | null>(null);
  const latestQuery = useRef('');

  // Reset transient state whenever the dialog (re)opens for a new source.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (source && !dialog.open) {
      setQuery('');
      setResults([]);
      setTarget(null);
      dialog.showModal();
    }
    if (!source && dialog.open) dialog.close();
  }, [source]);

  useEffect(() => {
    if (target || !source) return;
    const q = query.trim();
    latestQuery.current = q;
    if (q === '') {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await searchCompaniesForPickerAction(q);
      if (latestQuery.current !== q) return;
      // Never offer the source company as its own merge target.
      setResults((result.data?.options ?? []).filter((o) => o.id !== source.id));
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, target, source]);

  const fieldError = state?.error?.fieldErrors?.['targetCompanyId'];

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
      className="m-auto w-full max-w-md rounded-lg border border-edge-subtle bg-surface-3 p-0 text-fg shadow-xl backdrop:bg-overlay"
    >
      {source ? (
        <div className="flex flex-col gap-4 p-5" ref={containerRef}>
          <div>
            <h2 className="text-base font-semibold text-fg-strong">Merge this company</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Move everything from <span className="font-medium text-fg">{source.name}</span> into
              another company. Its contacts and leads move to the one you pick, and{' '}
              <span className="font-medium text-fg">{source.name}</span> is archived. This can’t be
              undone from here.
            </p>
          </div>

          {state?.error && !fieldError ? <FormError message={state.error.message} /> : null}

          {/* Survivor picker */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="merge-target" className="text-sm font-medium text-fg">
              Merge into <span aria-hidden="true">*</span>
            </label>
            {target ? (
              <div className="flex items-center justify-between gap-2 rounded-sm border border-edge bg-surface-2 px-3 py-1.5 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-fg">
                  <Building2Icon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
                  <span className="truncate">{target.name}</span>
                  {target.domain ? (
                    <span className="truncate text-xs text-fg-subtle">{target.domain}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  aria-label="Clear selection"
                  onClick={() => {
                    setTarget(null);
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
                  id="merge-target"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length > 0 && setOpen(true)}
                  placeholder="Search companies…"
                  autoComplete="off"
                  aria-invalid={fieldError ? true : undefined}
                  className={cn(
                    'h-9 w-full rounded-sm border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-subtle',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    fieldError ? 'border-danger' : 'border-edge',
                  )}
                />
                {open && (loading || query.trim() !== '') ? (
                  <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-edge-subtle bg-surface-3 py-1 shadow-lg">
                    {loading ? (
                      <li className="px-3 py-2 text-xs text-fg-subtle">Searching…</li>
                    ) : results.length > 0 ? (
                      results.map((o) => (
                        <li key={o.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setTarget(o);
                              setOpen(false);
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
                          >
                            <span className="truncate">{o.name}</span>
                            <span className="truncate text-xs text-fg-subtle">
                              {o.domain ?? ''}
                            </span>
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="px-3 py-2 text-xs text-fg-subtle">No other companies.</li>
                    )}
                  </ul>
                ) : null}
              </div>
            )}
            {fieldError ? (
              <p role="alert" className="text-xs text-danger">
                {fieldError}
              </p>
            ) : null}
          </div>

          <form action={formAction} className="flex items-center justify-end gap-2">
            <input type="hidden" name="sourceCompanyId" value={source.id} />
            {/* Keyed + uncontrolled so the selected id is always in the FormData
                and survives React 19's form-reset-on-action (Sprint 2.4 lesson). */}
            <input
              type="hidden"
              name="targetCompanyId"
              key={target?.id ?? 'none'}
              defaultValue={target?.id ?? ''}
            />
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={pending || !target}>
              {pending ? 'Merging…' : 'Merge company'}
            </Button>
          </form>
        </div>
      ) : null}
    </dialog>
  );
}
