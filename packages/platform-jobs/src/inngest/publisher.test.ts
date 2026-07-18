import { afterEach, describe, expect, it } from 'vitest';
import { hasEventPublisher, resetEventPublisherForTests } from '@verocrest/platform-event-bus';
import { registerBusPublisher } from './publisher';

// Import the concrete publisher module directly (not ../server) to avoid pulling
// the reconciliation → journal → next/headers chain into this node test.
afterEach(() => resetEventPublisherForTests());

describe('registerBusPublisher', () => {
  it('wires the Inngest publisher into the provider-agnostic bus', () => {
    expect(hasEventPublisher()).toBe(false);
    registerBusPublisher();
    expect(hasEventPublisher()).toBe(true);
  });
});
