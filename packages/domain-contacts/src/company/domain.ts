/**
 * Domain normalization. The DB generates `domain_normalized` as
 * lower(strip-leading-www) of `domain`, and dedupes on it (docs/04 §4.5).
 * For that to be reliable we must store a BARE HOST in `domain`, not a full
 * URL — so we extract the host from whatever the user typed.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (value === '') return null;

  // Add a scheme so URL() can parse bare hosts like "acme.com/path".
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(value) ? value : `https://${value}`;

  try {
    const host = new URL(withScheme).hostname;
    value = host;
  } catch {
    // Not URL-parseable — fall back to the raw token up to the first slash.
    value = value.split('/')[0] ?? value;
  }

  value = value.replace(/^www\./, '').replace(/\.$/, '');
  // A bare host must contain a dot and only host-legal characters.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) return null;
  return value;
}
