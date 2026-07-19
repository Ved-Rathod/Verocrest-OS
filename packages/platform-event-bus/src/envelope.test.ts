import { describe, expect, it } from 'vitest';
import { EVENT_NAMES, EVENT_SUBJECT_TYPE, EVENT_VERSIONS } from './catalogue';
import { buildEvent, journalRowFromEnvelope } from './envelope';
import { isUlid, ulid } from './ulid';

describe('event envelope', () => {
  it('covers every catalogue name with a version and subject', () => {
    expect(EVENT_NAMES).toHaveLength(30);
    for (const name of EVENT_NAMES) {
      expect(EVENT_VERSIONS[name]).toBe(1);
      expect(EVENT_SUBJECT_TYPE[name]).toMatch(
        /^(company|contact|lead|reminder|ai_call|icp|offer|knowledge_doc|integration|workspace|target|audit)$/,
      );
    }
  });

  it('builds and serializes a typed event', () => {
    const event = buildEvent({
      name: 'company.created',
      workspaceId: '11111111-1111-4111-8111-111111111111',
      actor: { type: 'user', id: '22222222-2222-4222-8222-222222222222' },
      subjectId: '33333333-3333-4333-8333-333333333333',
      payload: { company_id: '33333333-3333-4333-8333-333333333333' },
      occurredAt: '2026-07-07T00:00:00.000Z',
    });

    expect(isUlid(event.id)).toBe(true);
    expect(event.version).toBe(1);
    expect(event.subject.type).toBe('company');
    expect(journalRowFromEnvelope(event)).toMatchObject({
      id: event.id,
      workspace_id: event.workspaceId,
      name: 'company.created',
      actor_type: 'user',
      subject_id: event.subject.id,
      occurred_at: event.occurredAt,
    });
  });
});

describe('ulid', () => {
  it('generates sortable, valid identifiers', () => {
    const earlier = ulid(1_000);
    const later = ulid(2_000);
    expect(isUlid(earlier)).toBe(true);
    expect(later > earlier).toBe(true);
  });

  it('rejects invalid Crockford identifiers', () => {
    expect(isUlid('')).toBe(false);
    expect(isUlid('0000000000000000000000000I')).toBe(false);
  });
});
