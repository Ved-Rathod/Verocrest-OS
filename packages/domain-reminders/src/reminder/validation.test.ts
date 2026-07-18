import { describe, expect, it } from 'vitest';
import {
  reminderCreateSchema,
  reminderEditSchema,
  reminderListParamsSchema,
  reminderSnoozeSchema,
  toFieldErrors,
} from './validation';

const UUID = '22222222-2222-2222-2222-222222222222';

describe('reminderCreateSchema', () => {
  it('accepts a valid contact reminder', () => {
    const r = reminderCreateSchema.safeParse({
      entityType: 'contact',
      entityId: UUID,
      note: 'Follow up on proposal',
      dueAt: '2026-08-01T10:00',
    });
    expect(r.success).toBe(true);
  });

  it('normalizes an empty note to undefined', () => {
    const r = reminderCreateSchema.safeParse({
      entityType: 'lead',
      entityId: UUID,
      note: '   ',
      dueAt: '2026-08-01T10:00',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.note).toBeUndefined();
  });

  it('rejects a missing entity id with a field error', () => {
    const r = reminderCreateSchema.safeParse({
      entityType: 'company',
      entityId: '',
      dueAt: '2026-08-01T10:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(toFieldErrors(r.error).entityId).toBe('Select an item');
  });

  it('rejects an unsupported entity type (deal is not selectable in v0.1)', () => {
    const r = reminderCreateSchema.safeParse({
      entityType: 'deal',
      entityId: UUID,
      dueAt: '2026-08-01T10:00',
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(toFieldErrors(r.error).entityType).toBe('Choose what this reminder is about');
  });

  it('rejects a missing / invalid due date', () => {
    const empty = reminderCreateSchema.safeParse({
      entityType: 'contact',
      entityId: UUID,
      dueAt: '',
    });
    const bad = reminderCreateSchema.safeParse({
      entityType: 'contact',
      entityId: UUID,
      dueAt: 'not-a-date',
    });
    expect(empty.success).toBe(false);
    expect(bad.success).toBe(false);
    if (!bad.success) expect(toFieldErrors(bad.error).dueAt).toBe('Enter a valid date and time');
  });

  it('rejects unknown keys (strict)', () => {
    const r = reminderCreateSchema.safeParse({
      entityType: 'contact',
      entityId: UUID,
      dueAt: '2026-08-01T10:00',
      status: 'completed',
    });
    expect(r.success).toBe(false);
  });
});

describe('reminderEditSchema', () => {
  it('accepts note + dueAt only', () => {
    const r = reminderEditSchema.safeParse({ note: 'Updated', dueAt: '2026-09-01T09:30' });
    expect(r.success).toBe(true);
  });

  it('rejects an entity change attempt (immutable target)', () => {
    const r = reminderEditSchema.safeParse({ entityId: UUID, dueAt: '2026-09-01T09:30' });
    expect(r.success).toBe(false);
  });
});

describe('reminderSnoozeSchema', () => {
  it('accepts a future instant', () => {
    expect(reminderSnoozeSchema.safeParse({ until: '2999-01-01T00:00' }).success).toBe(true);
  });

  it('rejects a past instant', () => {
    const r = reminderSnoozeSchema.safeParse({ until: '2000-01-01T00:00' });
    expect(r.success).toBe(false);
    if (!r.success) expect(toFieldErrors(r.error).until).toBe('Snooze must be in the future');
  });
});

describe('reminderListParamsSchema', () => {
  it('defaults pageSize to 50 and leaves filters optional', () => {
    const r = reminderListParamsSchema.parse({});
    expect(r.pageSize).toBe(50);
    expect(r.status).toBeUndefined();
    expect(r.entityType).toBeUndefined();
  });

  it('treats empty-string filters as undefined', () => {
    const r = reminderListParamsSchema.parse({ status: '', entityType: '' });
    expect(r.status).toBeUndefined();
    expect(r.entityType).toBeUndefined();
  });
});
