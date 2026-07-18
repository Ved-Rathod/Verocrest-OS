'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2Icon, XIcon } from 'lucide-react';

/**
 * One-shot success banner on the companies surface. Read once from the URL, then
 * stripped via history.replaceState (no navigation, no refetch) so a refresh or
 * Back doesn't re-trigger it. Two triggers:
 *   ?archived=1                    → "Company archived successfully."
 *   ?merged=1&mc=<n>&ml=<n>        → "Companies merged. N contacts, M leads moved."
 */
export function CompanyArchivedNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let msg: string | null = null;

    if (params.get('archived') === '1') {
      msg = 'Company archived successfully.';
    } else if (params.get('merged') === '1') {
      const mc = Number(params.get('mc') ?? '0');
      const ml = Number(params.get('ml') ?? '0');
      const parts = [
        `${mc} ${mc === 1 ? 'contact' : 'contacts'}`,
        `${ml} ${ml === 1 ? 'lead' : 'leads'}`,
      ];
      msg = `Companies merged. ${parts.join(' and ')} moved here.`;
    }

    if (!msg) return;
    setMessage(msg);

    for (const k of ['archived', 'merged', 'mc', 'ml']) params.delete(k);
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);

    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-center justify-between gap-2 rounded-md bg-success-surface px-3 py-2 text-sm text-success"
    >
      <span className="flex items-center gap-2">
        <CheckCircle2Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {message}
      </span>
      <button
        type="button"
        onClick={() => setMessage(null)}
        aria-label="Dismiss"
        className="rounded-sm p-0.5 text-success/80 hover:text-success"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
