import { afterEach, describe, expect, it } from 'vitest';
import type { JournalEvent } from './journal';
import { resetEventPublisherForTests, setEventPublisher } from './publisher';
import { envelopeFromJournalEvent, replayEvents } from './replay';

const je = (over: Partial<JournalEvent> = {}): JournalEvent => ({
  id: '01J000000000000000000AAAAA',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  name: 'contact.created',
  version: 1,
  actorType: 'user',
  actorId: '22222222-2222-4222-8222-222222222222',
  subjectType: 'contact',
  subjectId: '33333333-3333-4333-8333-333333333333',
  payload: { contact_id: '33333333-3333-4333-8333-333333333333' },
  correlationId: null,
  causationId: null,
  occurredAt: '2026-07-15T00:00:00.000Z',
  emittedAt: '2026-07-15T00:00:00.000Z',
  ...over,
});

afterEach(() => resetEventPublisherForTests());

describe('envelopeFromJournalEvent', () => {
  it('preserves the ULID id (idempotency key) and reshapes actor/subject', () => {
    const env = envelopeFromJournalEvent(je());
    expect(env.id).toBe('01J000000000000000000AAAAA');
    expect(env.actor).toEqual({ type: 'user', id: '22222222-2222-4222-8222-222222222222' });
    expect(env.subject).toEqual({ type: 'contact', id: '33333333-3333-4333-8333-333333333333' });
    expect(env.workspaceId).toBe('11111111-1111-4111-8111-111111111111');
    expect(env.name).toBe('contact.created');
  });
});

describe('replayEvents', () => {
  it('publishes every event in order and returns the count', async () => {
    const seen: string[] = [];
    setEventPublisher({
      publish: async (e) => {
        seen.push(e.id);
      },
    });
    const count = await replayEvents([je({ id: 'A'.repeat(26) }), je({ id: 'B'.repeat(26) })]);
    expect(count).toBe(2);
    expect(seen).toEqual(['A'.repeat(26), 'B'.repeat(26)]);
  });
});
