'use client';

import { useState } from 'react';
import { Button } from '@verocrest/ui-kit';
import { createSupabaseBrowserClient } from '@verocrest/platform-integrations/supabase/browser';
import { hasClientEnv } from '@verocrest/config';

/** Google OAuth start (redirect flow) per docs/10 §5.3 mode "google". */
export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!hasClientEnv()) {
      setError('Supabase is not configured. Add the NEXT_PUBLIC_SUPABASE_* variables first.');
      return;
    }
    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    if (oauthError) {
      setError('Google sign-in didn’t start. Try again.');
      setPending(false);
    }
    // On success the browser navigates away to Google.
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" className="w-full" onClick={start} disabled={pending}>
        <GoogleMark />
        {pending ? 'Redirecting to Google…' : label}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.96h5.3c-.23 1.24-.93 2.29-1.98 3v2.5h3.2c1.87-1.73 2.95-4.27 2.95-7.28 0-.4-.03-.79-.1-1.18Z"
      />
      <path
        fill="currentColor"
        opacity="0.7"
        d="M12.18 21.5c2.67 0 4.91-.89 6.55-2.4l-3.2-2.5c-.89.6-2.03.95-3.35.95-2.58 0-4.76-1.74-5.54-4.08H3.33v2.58a9.9 9.9 0 0 0 8.85 5.45Z"
      />
      <path
        fill="currentColor"
        opacity="0.5"
        d="M6.64 13.47a5.97 5.97 0 0 1 0-3.8V7.09H3.33a9.93 9.93 0 0 0 0 8.96l3.31-2.58Z"
      />
      <path
        fill="currentColor"
        opacity="0.85"
        d="M12.18 6.58c1.45 0 2.75.5 3.78 1.48l2.83-2.83A9.53 9.53 0 0 0 12.18 2.5a9.9 9.9 0 0 0-8.85 5.45l3.31 2.58c.78-2.34 2.96-4.08 5.54-4.08Z"
      />
    </svg>
  );
}
