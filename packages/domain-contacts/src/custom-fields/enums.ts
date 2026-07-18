/** Custom-field enums per docs/04 §20.1. */
export const CUSTOM_FIELD_ENTITY_TYPES = ['contact', 'lead', 'deal', 'company'] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

/**
 * Entity types the app renders custom fields for in v0.1 (docs/06 §3). 'lead' and
 * 'deal' are in the frozen enum but out of scope this sprint (deal lands S10).
 */
export const SUPPORTED_CUSTOM_FIELD_ENTITIES = [
  'contact',
  'company',
] as const satisfies readonly CustomFieldEntityType[];
export type SupportedCustomFieldEntity = (typeof SUPPORTED_CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_TYPES = [
  'text',
  'long_text',
  'number',
  'currency',
  'date',
  'datetime',
  'boolean',
  'url',
  'email',
  'single_select',
  'multi_select',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** The FormData name prefix for a custom-field input (e.g. cf__lead_source). */
export const CUSTOM_FIELD_PREFIX = 'cf__';
