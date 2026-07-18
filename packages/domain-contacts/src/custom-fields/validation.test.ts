import { describe, expect, it } from 'vitest';
import { buildCustomFields } from './validation';
import type { CustomFieldDefinition } from './types';

function def(
  p: Partial<CustomFieldDefinition> & Pick<CustomFieldDefinition, 'fieldKey' | 'fieldType'>,
): CustomFieldDefinition {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    entityType: 'contact',
    fieldLabel: p.fieldKey,
    options: null,
    required: false,
    displayOrder: 100,
    ...p,
  };
}

function fd(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe('buildCustomFields', () => {
  it('accepts and coerces values by type', () => {
    const defs = [
      def({ fieldKey: 'source', fieldType: 'text' }),
      def({ fieldKey: 'budget', fieldType: 'number' }),
      def({ fieldKey: 'vip', fieldType: 'boolean' }),
    ];
    const { values, errors } = buildCustomFields(
      defs,
      fd([
        ['cf__source', ' referral '],
        ['cf__budget', '5000'],
        ['cf__vip', 'on'],
      ]),
    );
    expect(errors).toEqual({});
    expect(values).toEqual({ source: 'referral', budget: 5000, vip: true });
  });

  it('omits empty optional fields and defaults an unchecked boolean to false', () => {
    const defs = [
      def({ fieldKey: 'source', fieldType: 'text' }),
      def({ fieldKey: 'vip', fieldType: 'boolean' }),
    ];
    const { values, errors } = buildCustomFields(defs, fd([['cf__source', '']]));
    expect(errors).toEqual({});
    expect(values).toEqual({ vip: false });
  });

  it('flags a required field that is missing (keyed by input name)', () => {
    const defs = [def({ fieldKey: 'source', fieldType: 'text', required: true })];
    const { errors } = buildCustomFields(defs, fd([['cf__source', '  ']]));
    expect(errors['cf__source']).toBe('This field is required');
  });

  it('rejects a non-numeric number', () => {
    const defs = [def({ fieldKey: 'budget', fieldType: 'number' })];
    const { errors } = buildCustomFields(defs, fd([['cf__budget', 'abc']]));
    expect(errors['cf__budget']).toBe('Must be a number');
  });

  it('validates single_select against options', () => {
    const defs = [
      def({ fieldKey: 'tier', fieldType: 'single_select', options: ['gold', 'silver'] }),
    ];
    expect(buildCustomFields(defs, fd([['cf__tier', 'gold']])).values).toEqual({ tier: 'gold' });
    expect(buildCustomFields(defs, fd([['cf__tier', 'bronze']])).errors['cf__tier']).toBe(
      'Choose from the listed options',
    );
  });

  it('collects multi_select and rejects unknown options', () => {
    const defs = [def({ fieldKey: 'chans', fieldType: 'multi_select', options: ['email', 'dm'] })];
    expect(
      buildCustomFields(
        defs,
        fd([
          ['cf__chans', 'email'],
          ['cf__chans', 'dm'],
        ]),
      ).values,
    ).toEqual({ chans: ['email', 'dm'] });
    expect(
      buildCustomFields(
        defs,
        fd([
          ['cf__chans', 'email'],
          ['cf__chans', 'sms'],
        ]),
      ).errors['cf__chans'],
    ).toBe('Choose from the listed options');
  });

  it('validates email / url / date formats', () => {
    const defs = [
      def({ fieldKey: 'e', fieldType: 'email' }),
      def({ fieldKey: 'u', fieldType: 'url' }),
      def({ fieldKey: 'd', fieldType: 'date' }),
    ];
    const bad = buildCustomFields(
      defs,
      fd([
        ['cf__e', 'nope'],
        ['cf__u', 'ftp://x'],
        ['cf__d', '2026/01/01'],
      ]),
    );
    expect(bad.errors['cf__e']).toBeDefined();
    expect(bad.errors['cf__u']).toBeDefined();
    expect(bad.errors['cf__d']).toBeDefined();
    const good = buildCustomFields(
      defs,
      fd([
        ['cf__e', 'a@b.com'],
        ['cf__u', 'https://a.com'],
        ['cf__d', '2026-01-01'],
      ]),
    );
    expect(good.errors).toEqual({});
  });

  it('IGNORES cf__ inputs with no active definition (never persisted)', () => {
    const defs = [def({ fieldKey: 'known', fieldType: 'text' })];
    const { values } = buildCustomFields(
      defs,
      fd([
        ['cf__known', 'yes'],
        ['cf__injected', 'evil'],
        ['cf__admin', 'true'],
      ]),
    );
    expect(values).toEqual({ known: 'yes' });
    expect(values).not.toHaveProperty('injected');
    expect(values).not.toHaveProperty('admin');
  });
});
