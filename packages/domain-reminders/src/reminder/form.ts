/**
 * Pure FormData → reminder-input mapping (docs/10 §10). Extracted from actions.ts
 * so submission payloads are unit-testable. The entity target (type + id) is set
 * only at creation; the edit form submits just note + due time.
 */
export function parseReminderCreateFormData(formData: FormData): unknown {
  return {
    entityType: formData.get('entityType'),
    entityId: formData.get('entityId'),
    note: formData.get('note'),
    dueAt: formData.get('dueAt'),
  };
}

export function parseReminderEditFormData(formData: FormData): unknown {
  return {
    note: formData.get('note'),
    dueAt: formData.get('dueAt'),
  };
}
