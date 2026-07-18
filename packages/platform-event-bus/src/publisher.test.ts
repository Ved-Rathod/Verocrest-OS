import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEvent } from './envelope';
import {
  hasEventPublisher,
  publishToBus,
  resetEventPublisherForTests,
  setEventPublisher,
  type EventPublisher,
} from './publisher';

function sampleEvent() {
  return buildEvent({
    name: 'contact.created',
    workspaceId: '11111111-1111-4111-8111-111111111111',
    actor: { type: 'user', id: '22222222-2222-4222-8222-222222222222' },
    subjectId: '33333333-3333-4333-8333-333333333333',
    payload: { contact_id: '33333333-3333-4333-8333-333333333333' },
  });
}

afterEach(() => resetEventPublisherForTests());

describe('publishToBus', () => {
  it('is a no-op when no publisher is registered', async () => {
    expect(hasEventPublisher()).toBe(false);
    await expect(publishToBus(sampleEvent())).resolves.toBeUndefined();
  });

  it('delegates to the registered publisher', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const pub: EventPublisher = { publish };
    setEventPublisher(pub);
    expect(hasEventPublisher()).toBe(true);
    const event = sampleEvent();
    await publishToBus(event);
    expect(publish).toHaveBeenCalledWith(event);
  });

  it('never throws when the publisher fails (reconciliation is the safety net)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setEventPublisher({ publish: () => Promise.reject(new Error('bus down')) });
    await expect(publishToBus(sampleEvent())).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
