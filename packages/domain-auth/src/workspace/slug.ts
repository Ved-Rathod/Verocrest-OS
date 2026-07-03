/**
 * Workspace slug generation — lowercase, url-safe, unique-by-suffix.
 * Format enforced by the provision function: ^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$
 */

const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSuffix(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length];
  return out;
}

/** Normalize an arbitrary label (name or email local-part) into a slug base. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/^-+|-+$/g, '');
  return base.length >= 2 ? base : 'workspace';
}

/** Slug candidate with entropy suffix — collisions handled by retry upstream. */
export function generateWorkspaceSlug(label: string): string {
  return `${slugify(label)}-${randomSuffix(6)}`;
}

/** Derive a human workspace name from what we know about the user. */
export function defaultWorkspaceName(displayName: string | null, email: string | null): string {
  if (displayName && displayName.trim().length >= 2) {
    return `${displayName.trim().split(/\s+/)[0]}'s Workspace`.slice(0, 60);
  }
  const local = email?.split('@')[0]?.trim();
  if (local && local.length >= 2) return `${local}'s Workspace`.slice(0, 60);
  return 'My Workspace';
}
