'use client';

import { useEffect, useState } from 'react';
import { formatWhenLocal, formatWhenUTC } from './reminder-format';

/**
 * Renders an instant as text. First paint uses the deterministic UTC format (so
 * server HTML and client hydration match exactly — no mismatch); after mount it
 * upgrades to the viewer's local timezone. Wrapped in <time> for semantics.
 */
export function DateTime({ iso, className }: { iso: string; className?: string }) {
  const [text, setText] = useState(() => formatWhenUTC(iso));

  useEffect(() => {
    setText(formatWhenLocal(iso));
  }, [iso]);

  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
