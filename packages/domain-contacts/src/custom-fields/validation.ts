import { CUSTOM_FIELD_PREFIX } from './enums';
import type { CustomFieldDefinition, CustomFieldValues } from './types';

/**
 * Coerce + validate submitted custom-field values against the workspace's ACTIVE
 * definitions (docs/04 §20.1). Pure + unit-tested. Security posture (Sprint 2.6):
 * only fields with an active definition are read — any other `cf__*` FormData
 * entry is ignored, never persisted. Every value is validated server-side by
 * type; required fields must be present. Errors are keyed by the input name
 * (`cf__<field_key>`) so the form can render them inline.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_TEXT = 500;
const MAX_LONG_TEXT = 5000;

type FieldResult =
  | { present: true; value: string | number | boolean | string[] }
  | { present: false }
  | { error: string };

function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function coerceField(def: CustomFieldDefinition, formData: FormData, name: string): FieldResult {
  // Boolean: a checkbox always has a state; false is a real value, never "empty".
  if (def.fieldType === 'boolean') {
    const raw = formData.get(name);
    return { present: true, value: raw === 'on' || raw === 'true' };
  }

  // Multi-select: collect all checked options, reject anything not in the list.
  if (def.fieldType === 'multi_select') {
    const opts = def.options ?? [];
    const chosen = formData
      .getAll(name)
      .filter((v): v is string => typeof v === 'string' && v !== '');
    if (chosen.some((v) => !opts.includes(v))) return { error: 'Choose from the listed options' };
    if (chosen.length === 0) {
      return def.required ? { error: 'This field is required' } : { present: false };
    }
    return { present: true, value: chosen };
  }

  const rawVal = formData.get(name);
  const raw = typeof rawVal === 'string' ? rawVal.trim() : '';
  if (raw === '') {
    return def.required ? { error: 'This field is required' } : { present: false };
  }

  switch (def.fieldType) {
    case 'text':
      if (raw.length > MAX_TEXT) return { error: `Must be at most ${MAX_TEXT} characters` };
      return { present: true, value: raw };
    case 'long_text':
      if (raw.length > MAX_LONG_TEXT)
        return { error: `Must be at most ${MAX_LONG_TEXT} characters` };
      return { present: true, value: raw };
    case 'number':
    case 'currency': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { error: 'Must be a number' };
      return { present: true, value: n };
    }
    case 'date':
      if (!DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) return { error: 'Use YYYY-MM-DD' };
      return { present: true, value: raw };
    case 'datetime':
      if (Number.isNaN(Date.parse(raw))) return { error: 'Enter a valid date and time' };
      return { present: true, value: raw };
    case 'email':
      if (!EMAIL_RE.test(raw)) return { error: 'Enter a valid email' };
      return { present: true, value: raw };
    case 'url':
      if (!isValidUrl(raw)) return { error: 'Enter a valid URL (http/https)' };
      return { present: true, value: raw };
    case 'single_select':
      if (!(def.options ?? []).includes(raw)) return { error: 'Choose from the listed options' };
      return { present: true, value: raw };
    default:
      return { present: false };
  }
}

export function buildCustomFields(
  definitions: CustomFieldDefinition[],
  formData: FormData,
): { values: CustomFieldValues; errors: Record<string, string> } {
  const values: CustomFieldValues = {};
  const errors: Record<string, string> = {};

  for (const def of definitions) {
    const name = `${CUSTOM_FIELD_PREFIX}${def.fieldKey}`;
    const result = coerceField(def, formData, name);
    if ('error' in result) {
      errors[name] = result.error;
    } else if (result.present) {
      values[def.fieldKey] = result.value;
    }
  }

  return { values, errors };
}
