import { inngest } from '../client';
import { DEMO_SUBSCRIBED_EVENTS } from '../demo-events';
import { recordEventMetric } from '../../metrics';

/**
 * Subscriber #2 (demo): independently counts each subscribed event (Sprint 3.2
 * decision #7). Running alongside the logging subscriber on the same events proves
 * that multiple subscribers each receive the same event — the core fan-out
 * guarantee of the bus.
 */
export const eventMetricsSubscriber = inngest.createFunction(
  { id: 'event-metrics-subscriber', name: 'Event metrics subscriber' },
  DEMO_SUBSCRIBED_EVENTS.map((name) => ({ event: name })),
  async ({ event, logger }) => {
    const count = recordEventMetric(event.name);
    logger.info('bus event counted', { subscriber: 'metrics', name: event.name, count });
    return { subscriber: 'metrics', counted: event.name, count };
  },
);
