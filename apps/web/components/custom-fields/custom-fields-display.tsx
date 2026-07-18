// Server-safe (no 'use client'): renders on contact/company detail pages.
import type { CustomFieldDefinition } from '@verocrest/domain-contacts';

/**
 * Labeled read-only custom-field values on a detail page (Sprint 2.6). Shows only
 * definitions that have a stored value, in display order. Renders nothing when
 * there are none — detail pages are unchanged where custom fields aren't used.
 */
function formatValue(def: CustomFieldDefinition, v: unknown): string {
  if (def.fieldType === 'boolean') return v === true || v === 'true' ? 'Yes' : 'No';
  if (def.fieldType === 'multi_select') return Array.isArray(v) ? v.join(', ') : String(v);
  return String(v);
}

export function CustomFieldsDisplay({
  definitions,
  values,
}: {
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown>;
}) {
  const rows = definitions.filter(
    (def) => def.fieldKey in values && values[def.fieldKey] !== '' && values[def.fieldKey] != null,
  );
  if (rows.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
        Custom fields
      </p>
      <dl className="grid grid-cols-2 gap-3">
        {rows.map((def) => (
          <div key={def.id}>
            <dt className="text-xs text-fg-muted">{def.fieldLabel}</dt>
            <dd className="mt-0.5 text-sm text-fg">{formatValue(def, values[def.fieldKey])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
