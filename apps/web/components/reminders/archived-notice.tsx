'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2Icon, XIcon } from 'lucide-react';

/**
 * One-shot success banner after a reminder is archived from the detail page.
 * ReminderActions redirects to /reminders?archived=1; this reads the flag, shows
 * the message, then strips the param via history.replaceState (no navigation, no
 * refetch) so a refresh or Back doesn't re-trigger it. Auto-hides.
 */
export function ArchivedNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('archived') !== '1') return;
    setVisible(true);

    params.delete('archived');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);

    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-center justify-between gap-2 rounded-md bg-success-surface px-3 py-2 text-sm text-success"
    >
      <span className="flex items-center gap-2">
        <CheckCircle2Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Reminder archived successfully.
      </span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="rounded-sm p-0.5 text-success/80 hover:text-success"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
