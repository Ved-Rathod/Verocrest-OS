import { describe, expect, it } from 'vitest';
import { toFieldErrors } from '../company/validation';
import { contactInputSchema, contactListParamsSchema } from './validation';

describe('contactInputSchema', () => {
  it('accepts a contact with just a first name', () => {
    const parsed = contactInputSchema.parse({ firstName: 'Sarah' });
    expect(parsed.firstName).toBe('Sarah');
    expect(parsed.isClient).toBe(false);
  });

  it('accepts a contact with just an email and normalizes it', () => {
    const parsed = contactInputSchema.parse({ primaryEmail: '  Sarah@Clinic.COM ' });
    expect(parsed.primaryEmail).toBe('sarah@clinic.com');
  });

  it('rejects a contact with no name and no email', () => {
    const r = contactInputSchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) expect(toFieldErrors(r.error)).toHaveProperty('firstName');
  });

  it('rejects an invalid email', () => {
    expect(contactInputSchema.safeParse({ firstName: 'S', primaryEmail: 'nope' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown seniority and an invalid companyId', () => {
    expect(contactInputSchema.safeParse({ firstName: 'S', seniority: 'chief' }).success).toBe(
      false,
    );
    expect(contactInputSchema.safeParse({ firstName: 'S', companyId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('coerces checkboxes', () => {
    const parsed = contactInputSchema.parse({
      firstName: 'S',
      isDecisionMaker: 'on',
      isClient: 'true',
    });
    expect(parsed.isDecisionMaker).toBe(true);
    expect(parsed.isClient).toBe(true);
  });

  it('rejects unknown keys (docs/10 §9.4)', () => {
    expect(contactInputSchema.safeParse({ firstName: 'S', admin: 1 }).success).toBe(false);
  });
});

describe('contactListParamsSchema', () => {
  it('defaults isClient to all and pageSize to 50', () => {
    const p = contactListParamsSchema.parse({});
    expect(p.isClient).toBe('all');
    expect(p.pageSize).toBe(50);
  });
});
