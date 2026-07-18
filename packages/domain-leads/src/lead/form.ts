/**
 * Pure FormData → lead-input mapping (docs/10 §6.3). Extracted from actions.ts
 * so the create/edit submission payload — including the contactId supplied by
 * the ContactPicker's hidden field — is unit-testable (Sprint 2.3 regression).
 */
export function parseLeadFormData(formData: FormData): unknown {
  return {
    contactId: formData.get('contactId'),
    status: formData.get('status'),
    priority: formData.get('priority'),
    source: formData.get('source'),
    estimatedValue: formData.get('estimatedValue'),
    currency: formData.get('currency'),
    expectedCloseDate: formData.get('expectedCloseDate'),
    notes: formData.get('notes'),
    disqualifiedReason: formData.get('disqualifiedReason'),
    tags:
      typeof formData.get('tags') === 'string'
        ? String(formData.get('tags'))
            .split(/[\n,]/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0 && t.length <= 40)
            .slice(0, 50)
        : [],
  };
}
