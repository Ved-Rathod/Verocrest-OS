'use client';

import { useEffect, useRef, useState } from 'react';
import { PlusIcon, UserIcon, XIcon } from 'lucide-react';
import {
  createContactAction,
  searchContactsForPickerAction,
} from '@verocrest/domain-contacts/actions';
import type { ContactOption } from '@verocrest/domain-contacts';
import { Button, InputField, cn } from '@verocrest/ui-kit';
import { FormError } from '@/components/auth/form-error';

export type SelectedContact = {
  id: string;
  name: string;
  email: string | null;
  companyName: string | null;
};

/**
 * Contact picker for lead creation (Amendment 001, Decision 2): select an
 * existing contact OR create one inline. CONTROLLED by the parent — the parent
 * (LeadForm) owns `value` and renders the hidden `contactId` field, so the
 * selected id is guaranteed present in the submitted FormData and survives
 * React 19's form-reset-on-action. Company derives from the contact.
 */
export function ContactPicker({
  value,
  onChange,
  error,
}: {
  value: SelectedContact | null;
  onChange: (contact: SelectedContact | null) => void;
  error?: string;
}) {
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestQuery = useRef('');

  // Inline-create state
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (value || mode !== 'search') return;
    const q = query.trim();
    latestQuery.current = q;
    if (q === '') {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await searchContactsForPickerAction(q);
      if (latestQuery.current !== q) return;
      setResults(result.data?.options ?? []);
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, value, mode]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function createInline() {
    setCreating(true);
    setCreateError(null);
    setCreateFieldErrors({});
    // Contact first, then lead (Amendment 001): programmatic FormData call into
    // domain-contacts' existing Server Action.
    const fd = new FormData();
    fd.set('firstName', newFirst);
    fd.set('lastName', newLast);
    fd.set('primaryEmail', newEmail);
    const result = await createContactAction(null, fd);
    setCreating(false);

    if (result.error) {
      setCreateError(result.error.fieldErrors ? null : result.error.message);
      setCreateFieldErrors(result.error.fieldErrors ?? {});
      return;
    }
    if (result.data) {
      const c = result.data.contact;
      const displayName =
        [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
        c.primaryEmail ||
        'Unnamed contact';
      // Report selection UP to the parent form (owns the hidden field).
      onChange({ id: c.id, name: displayName, email: c.primaryEmail, companyName: c.companyName });
      setMode('search');
      setNewFirst('');
      setNewLast('');
      setNewEmail('');
    }
  }

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      <label htmlFor="contact-picker" className="text-sm font-medium text-fg">
        Contact <span aria-hidden="true">*</span>
      </label>

      {value ? (
        <>
          <div className="flex items-center justify-between gap-2 rounded-sm border border-edge bg-surface-2 px-3 py-1.5 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-fg">
              <UserIcon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
              <span className="truncate">{value.name}</span>
              {value.email ? (
                <span className="truncate text-xs text-fg-subtle">{value.email}</span>
              ) : null}
            </span>
            <button
              type="button"
              aria-label="Clear contact"
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
          {/* Company derives from the contact (Amendment 001) */}
          <p className="text-xs text-fg-muted">
            Company:{' '}
            {value.companyName ? (
              <span className="text-fg">{value.companyName}</span>
            ) : (
              <span className="text-fg-subtle">none — derived from the contact</span>
            )}
          </p>
        </>
      ) : mode === 'create' ? (
        <div className="flex flex-col gap-3 rounded-md border border-edge bg-surface-2 p-3">
          <p className="text-xs font-medium text-fg-muted">New contact</p>
          {createError ? <FormError message={createError} /> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InputField
              label="First name"
              value={newFirst}
              onChange={(e) => setNewFirst(e.target.value)}
              error={createFieldErrors['firstName']}
              autoFocus
            />
            <InputField
              label="Last name"
              value={newLast}
              onChange={(e) => setNewLast(e.target.value)}
              error={createFieldErrors['lastName']}
            />
          </div>
          <InputField
            label="Email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            error={createFieldErrors['primaryEmail']}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setMode('search')}
              disabled={creating}
            >
              Back to search
            </Button>
            <Button size="sm" type="button" onClick={createInline} disabled={creating}>
              {creating ? 'Creating…' : 'Create contact'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <input
            id="contact-picker"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search contacts…"
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
              ) : (
                <>
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange({
                            id: c.id,
                            name: c.name,
                            email: c.email,
                            companyName: c.companyName,
                          });
                          setOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="truncate text-xs text-fg-subtle">
                          {c.email ?? c.companyName ?? ''}
                        </span>
                      </button>
                    </li>
                  ))}
                  {results.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-fg-subtle">No matches.</li>
                  ) : null}
                </>
              )}
            </ul>
          ) : null}
        </div>
      )}

      {!value && mode === 'search' ? (
        <button
          type="button"
          onClick={() => setMode('create')}
          className="flex w-fit items-center gap-1 text-xs text-primary hover:text-primary-hover"
        >
          <PlusIcon className="size-3.5" strokeWidth={2} /> Create a new contact
        </button>
      ) : null}

      {error && !value ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
