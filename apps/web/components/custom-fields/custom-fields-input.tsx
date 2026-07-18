'use client';

import { CUSTOM_FIELD_PREFIX, type CustomFieldDefinition } from '@verocrest/domain-contacts';
import { InputField, TextareaField, cn } from '@verocrest/ui-kit';

/**
 * Renders form inputs for the workspace's active custom-field definitions
 * (Sprint 2.6, docs/04 §20.1). Each input is named `cf__<field_key>` so the
 * Server Action can collect + validate them generically. Uncontrolled
 * (defaultValue) — values are read from FormData on submit. Renders nothing when
 * there are no definitions, so forms are unchanged where custom fields aren't set.
 */
export function CustomFieldsInput({
  definitions,
  initial,
  errors,
}: {
  definitions: CustomFieldDefinition[];
  initial?: Record<string, unknown>;
  errors?: Record<string, string>;
}) {
  if (definitions.length === 0) return null;

  const selectClasses = cn(
    'h-9 rounded-sm border border-edge bg-surface-2 px-3 text-sm text-fg',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  );

  return (
    <fieldset className="flex flex-col gap-4 border-t border-edge-subtle pt-4">
      <legend className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        Custom fields
      </legend>

      {definitions.map((def) => {
        const name = `${CUSTOM_FIELD_PREFIX}${def.fieldKey}`;
        const raw = initial?.[def.fieldKey];
        const error = errors?.[name];
        const label = def.fieldLabel + (def.required ? ' *' : '');
        const options = def.options ?? [];

        if (def.fieldType === 'boolean') {
          return (
            <label key={def.id} className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                name={name}
                defaultChecked={raw === true || raw === 'true'}
                className="size-4 rounded-sm border-edge accent-[var(--vc-primary)]"
              />
              {def.fieldLabel}
            </label>
          );
        }

        if (def.fieldType === 'long_text') {
          return (
            <TextareaField
              key={def.id}
              label={label}
              name={name}
              rows={3}
              defaultValue={raw == null ? '' : String(raw)}
              error={error}
            />
          );
        }

        if (def.fieldType === 'single_select') {
          return (
            <div key={def.id} className="flex flex-col gap-1.5">
              <label htmlFor={name} className="text-sm font-medium text-fg">
                {label}
              </label>
              <select
                id={name}
                name={name}
                defaultValue={raw == null ? '' : String(raw)}
                className={selectClasses}
              >
                <option value="">—</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              {error ? (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          );
        }

        if (def.fieldType === 'multi_select') {
          const selected = Array.isArray(raw) ? raw.map(String) : [];
          return (
            <div key={def.id} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">{label}</span>
              <div className="flex flex-wrap gap-3">
                {options.map((o) => (
                  <label key={o} className="flex items-center gap-1.5 text-sm text-fg">
                    <input
                      type="checkbox"
                      name={name}
                      value={o}
                      defaultChecked={selected.includes(o)}
                      className="size-4 rounded-sm border-edge accent-[var(--vc-primary)]"
                    />
                    {o}
                  </label>
                ))}
              </div>
              {error ? (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          );
        }

        // Scalar inputs: text / number / currency / date / datetime / email / url
        const type =
          def.fieldType === 'number' || def.fieldType === 'currency'
            ? 'number'
            : def.fieldType === 'date'
              ? 'date'
              : def.fieldType === 'datetime'
                ? 'datetime-local'
                : def.fieldType === 'email'
                  ? 'email'
                  : def.fieldType === 'url'
                    ? 'url'
                    : 'text';

        return (
          <InputField
            key={def.id}
            label={label}
            name={name}
            type={type}
            defaultValue={raw == null ? '' : String(raw)}
            error={error}
          />
        );
      })}
    </fieldset>
  );
}
