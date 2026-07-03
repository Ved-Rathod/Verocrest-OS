import type { User } from '@supabase/supabase-js';

/**
 * The user shape exposed upward to domain + app code. Vendor types stay inside
 * this package (docs/11 §2 — interfaces stable, vendors swappable).
 */
export type AuthUser = {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

export function toAuthUser(user: User): AuthUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? null,
    emailConfirmed: Boolean(user.email_confirmed_at),
    displayName:
      typeof meta['full_name'] === 'string'
        ? meta['full_name']
        : typeof meta['name'] === 'string'
          ? meta['name']
          : null,
    avatarUrl: typeof meta['avatar_url'] === 'string' ? meta['avatar_url'] : null,
  };
}
