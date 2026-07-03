import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';

/**
 * OAuth / email-verification / password-recovery code exchange per docs/10 §5.5–5.6.
 * Google OAuth, signup confirmation, and reset links all land here with a `code`;
 * we exchange it for a session and redirect to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/';
  // Open-redirect guard: only same-origin relative paths.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired/invalid links (F-ONB-003 recovery path) → signin with a clear flag.
    return NextResponse.redirect(`${origin}/signin?error=link_invalid`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
