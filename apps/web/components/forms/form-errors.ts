/**
 * Validation errors are keyed by Zod's `issue.path.join('.')` (see the domain
 * action `fieldErrors` mappers), so a nested/array field yields a key like
 * `deliverables.0.title`. Forms render inline errors only for a fixed set of
 * flat field names, so a nested issue would otherwise be invisible — and the
 * general error banner was being suppressed whenever ANY field error existed,
 * producing a silent validation failure. This surfaces the messages that no
 * inline field is showing, so the banner can display them.
 */
export function unmappedFieldErrors(
  fieldErrors: Record<string, string> | undefined,
  inlineKeys: readonly string[],
): string[] {
  if (!fieldErrors) return [];
  const inline = new Set(inlineKeys);
  return Object.entries(fieldErrors)
    .filter(([key]) => !inline.has(key.split('.')[0] ?? key))
    .map(([, message]) => message);
}
