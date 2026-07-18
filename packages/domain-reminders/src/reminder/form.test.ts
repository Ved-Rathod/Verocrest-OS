import { describe, expect, it } from 'vitest';
import { parseReminderCreateFormData, parseReminderEditFormData } from './form';
import { reminderCreateSchema, reminderEditSchema } from './validation';

const UUID = '33333333-3333-3333-3333-333333333333';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe('parseReminderCreateFormData', () => {
  it('maps the create fields and validates end-to-end', () => {
    const parsed = parseReminderCreateFormData(
      fd({ entityType: 'contact', entityId: UUID, note: 'Call back', dueAt: '2026-08-10T14:00' }),
    );
    const result = reminderCreateSchema.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityType).toBe('contact');
      expect(result.data.entityId).toBe(UUID);
      expect(result.data.note).toBe('Call back');
    }
  });

  it('yields null for absent keys (empty FormData) → validation fails cleanly', () => {
    const parsed = parseReminderCreateFormData(new FormData());
    expect(reminderCreateSchema.safeParse(parsed).success).toBe(false);
  });
});

describe('parseReminderEditFormData', () => {
  it('maps only note + dueAt (entity target is not editable)', () => {
    const parsed = parseReminderEditFormData(
      fd({ reminderId: UUID, note: 'New note', dueAt: '2026-08-10T14:00', entityId: 'ignored' }),
    ) as Record<string, unknown>;
    expect(parsed).toEqual({ note: 'New note', dueAt: '2026-08-10T14:00' });
    expect(reminderEditSchema.safeParse(parsed).success).toBe(true);
  });
});
