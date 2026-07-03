import { describe, expect, it } from 'vitest';
import { isValidTimezone, workspaceSettingsSchema } from './validation';

describe('isValidTimezone', () => {
  it('accepts real IANA timezones', () => {
    for (const tz of ['UTC', 'Asia/Kolkata', 'Australia/Sydney', 'America/New_York']) {
      expect(isValidTimezone(tz)).toBe(true);
    }
  });

  it('rejects junk', () => {
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isValidTimezone('not a tz')).toBe(false);
  });
});

describe('workspaceSettingsSchema', () => {
  const valid = { name: 'Verocrest', timezone: 'Asia/Kolkata', defaultCurrency: 'USD' as const };

  it('accepts a valid payload and trims the name', () => {
    const parsed = workspaceSettingsSchema.parse({ ...valid, name: '  Verocrest  ' });
    expect(parsed.name).toBe('Verocrest');
  });

  it('rejects names outside 2–60 chars (docs/04 §3.1 constraint)', () => {
    expect(workspaceSettingsSchema.safeParse({ ...valid, name: 'V' }).success).toBe(false);
    expect(workspaceSettingsSchema.safeParse({ ...valid, name: 'x'.repeat(61) }).success).toBe(
      false,
    );
  });

  it('rejects unsupported currencies (FR-FIN-008 launch list)', () => {
    expect(workspaceSettingsSchema.safeParse({ ...valid, defaultCurrency: 'JPY' }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys (docs/10 §9.4 strict boundary)', () => {
    expect(workspaceSettingsSchema.safeParse({ ...valid, plan: 'enterprise' }).success).toBe(false);
  });
});
