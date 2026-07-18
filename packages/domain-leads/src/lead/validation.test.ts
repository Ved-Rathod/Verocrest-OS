import { describe, expect, it } from 'vitest';
import { leadInputSchema, leadListParamsSchema, toFieldErrors } from './validation';

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';

describe('leadInputSchema', () => {
  it('accepts a minimal valid lead', () => {
    const parsed = leadInputSchema.parse({ contactId: CONTACT_ID, status: 'new' });
    expect(parsed.contactId).toBe(CONTACT_ID);
    expect(parsed.tags).toEqual([]);
  });

  it('requires a contact (Amendment 001, Decision 2)', () => {
    const r = leadInputSchema.safeParse({ status: 'new' });
    expect(r.success).toBe(false);
    if (!r.success) expect(toFieldErrors(r.error)).toHaveProperty('contactId');
  });

  it('rejects system statuses reserved for the LIE', () => {
    for (const s of ['enriching', 'scored', 'ready']) {
      expect(leadInputSchema.safeParse({ contactId: CONTACT_ID, status: s }).success).toBe(false);
    }
  });

  it('requires currency when estimated value is set (Amendment 001)', () => {
    const r = leadInputSchema.safeParse({
      contactId: CONTACT_ID,
      status: 'new',
      estimatedValue: '5000',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(toFieldErrors(r.error)).toHaveProperty('currency');
  });

  it('accepts value + supported currency and coerces the number', () => {
    const parsed = leadInputSchema.parse({
      contactId: CONTACT_ID,
      status: 'contacted',
      estimatedValue: '7500.50',
      currency: 'AUD',
    });
    expect(parsed.estimatedValue).toBe(7500.5);
    expect(parsed.currency).toBe('AUD');
  });

  it('rejects unsupported currency and negative value', () => {
    expect(
      leadInputSchema.safeParse({
        contactId: CONTACT_ID,
        status: 'new',
        estimatedValue: '10',
        currency: 'JPY',
      }).success,
    ).toBe(false);
    expect(
      leadInputSchema.safeParse({
        contactId: CONTACT_ID,
        status: 'new',
        estimatedValue: '-5',
        currency: 'USD',
      }).success,
    ).toBe(false);
  });

  it('validates the expected close date format', () => {
    expect(
      leadInputSchema.safeParse({
        contactId: CONTACT_ID,
        status: 'new',
        expectedCloseDate: '2026-09-01',
      }).success,
    ).toBe(true);
    expect(
      leadInputSchema.safeParse({
        contactId: CONTACT_ID,
        status: 'new',
        expectedCloseDate: '01/09/2026',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid priority and unknown keys', () => {
    expect(
      leadInputSchema.safeParse({ contactId: CONTACT_ID, status: 'new', priority: 'urgent' })
        .success,
    ).toBe(false);
    expect(
      leadInputSchema.safeParse({ contactId: CONTACT_ID, status: 'new', admin: true }).success,
    ).toBe(false);
  });
});

describe('leadListParamsSchema', () => {
  it('defaults pageSize and accepts filters', () => {
    const p = leadListParamsSchema.parse({ status: 'contacted', priority: 'high' });
    expect(p.pageSize).toBe(50);
    expect(p.status).toBe('contacted');
    expect(p.priority).toBe('high');
  });

  it('treats empty filter strings as unset', () => {
    const p = leadListParamsSchema.parse({ status: '', priority: '' });
    expect(p.status).toBeUndefined();
    expect(p.priority).toBeUndefined();
  });
});
