import { describe, expect, it } from 'vitest';
import { parseLeadFormData } from './form';
import { leadInputSchema } from './validation';

/**
 * Sprint 2.3 regression — the inline-contact-creation → lead-creation flow.
 *
 * The blocking bug: the ContactPicker's contactId was carried by a controlled
 * hidden <input> without onChange, so the value was dropped from the submitted
 * FormData and createLeadAction always saw an empty contactId. The fix moves
 * the hidden field into the form as an uncontrolled, keyed input. These tests
 * lock the data contract that the fix restores: a FormData carrying contactId
 * (as the fixed hidden field now does) parses into a valid, creatable lead
 * payload — and one without contactId is rejected exactly as the bug report
 * described ("A contact is required").
 */

const NEW_CONTACT_ID = '22222222-2222-2222-2222-222222222222';

function leadFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe('inline contact creation → lead creation (regression)', () => {
  it('carries the newly-created contactId through to a valid lead payload', () => {
    // Simulates: user creates a contact inline, the picker selects it, and the
    // fixed hidden field submits its id with the lead form.
    const fd = leadFormData({ contactId: NEW_CONTACT_ID, status: 'new' });

    const payload = parseLeadFormData(fd);
    const parsed = leadInputSchema.safeParse(payload);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contactId).toBe(NEW_CONTACT_ID);
    }
  });

  it('carries contactId alongside the full lead field set', () => {
    const fd = leadFormData({
      contactId: NEW_CONTACT_ID,
      status: 'contacted',
      priority: 'high',
      source: 'referral',
      estimatedValue: '5000',
      currency: 'AUD',
      expectedCloseDate: '2026-09-01',
      notes: 'Met at conference',
      tags: 'dental, warm',
    });

    const parsed = leadInputSchema.safeParse(parseLeadFormData(fd));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contactId).toBe(NEW_CONTACT_ID);
      expect(parsed.data.estimatedValue).toBe(5000);
      expect(parsed.data.currency).toBe('AUD');
      expect(parsed.data.tags).toEqual(['dental', 'warm']);
    }
  });

  it('reproduces the bug: a submission WITHOUT contactId is rejected', () => {
    // This is exactly what the old controlled-hidden-input produced — an empty
    // contactId reaching the action, yielding "A contact is required".
    const fd = leadFormData({ status: 'new' });

    const parsed = leadInputSchema.safeParse(parseLeadFormData(fd));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const contactIssue = parsed.error.issues.find((i) => i.path.join('.') === 'contactId');
      expect(contactIssue).toBeDefined();
      expect(contactIssue?.message).toBe('A contact is required');
    }
  });

  it('treats an empty-string contactId (dropped hidden value) as missing', () => {
    // The precise failure mode of the bug: hidden input present but value ''.
    const fd = leadFormData({ contactId: '', status: 'new' });
    const parsed = leadInputSchema.safeParse(parseLeadFormData(fd));
    expect(parsed.success).toBe(false);
  });
});
