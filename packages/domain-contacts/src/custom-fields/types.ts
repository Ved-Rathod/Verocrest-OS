import { z } from 'zod';
import { CUSTOM_FIELD_ENTITY_TYPES, CUSTOM_FIELD_TYPES, type CustomFieldType } from './enums';

/** Read shape of a custom-field definition (docs/04 §20.1). */
export const CUSTOM_FIELD_DEFINITION_SELECT =
  'id, entity_type, field_key, field_label, field_type, options, required, active, display_order';

export const customFieldDefinitionRowSchema = z.object({
  id: z.string().uuid(),
  entity_type: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
  field_key: z.string(),
  field_label: z.string(),
  field_type: z.enum(CUSTOM_FIELD_TYPES),
  // options jsonb: for single_select / multi_select. Tolerate null / odd shapes.
  options: z.array(z.string()).nullable().catch(null),
  required: z.boolean(),
  active: z.boolean(),
  display_order: z.number().int(),
});

export type CustomFieldDefinition = {
  id: string;
  entityType: (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];
  fieldKey: string;
  fieldLabel: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  required: boolean;
  displayOrder: number;
};

export function toCustomFieldDefinition(
  row: z.infer<typeof customFieldDefinitionRowSchema>,
): CustomFieldDefinition {
  return {
    id: row.id,
    entityType: row.entity_type,
    fieldKey: row.field_key,
    fieldLabel: row.field_label,
    fieldType: row.field_type,
    options: row.options,
    required: row.required,
    displayOrder: row.display_order,
  };
}

/** Persisted custom-field values: field_key → primitive | string[] (multi_select). */
export type CustomFieldValues = Record<string, string | number | boolean | string[]>;
