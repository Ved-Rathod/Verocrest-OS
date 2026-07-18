import { inngest } from '../client';
import { DEMO_SUBSCRIBED_EVENTS } from '../demo-events';

/**
 * Subscriber #1 (demo): logs each subscribed event as it fans out, proving the
 * journal → bus → subscriber path end-to-end (Sprint 3.2 DoD). The handler is
 * idempotent (pure log) per docs/03 §8.7.
 */
export const journalLoggingSubscriber = inngest.createFunction(
  { id: 'journal-logging-subscriber', name: 'Journal logging subscriber' },
  DEMO_SUBSCRIBED_EVENTS.map((name) => ({ event: name })),
  async ({ event, logger }) => {
    const envelope = event.data;
    logger.info('bus event received', {
      subscriber: 'logging',
      name: event.name,
      id: envelope.id,
      workspaceId: envelope.workspaceId,
      subjectType: envelope.subject.type,
      subjectId: envelope.subject.id,
      occurredAt: envelope.occurredAt,
    });
    return { subscriber: 'logging', handled: event.name, id: envelope.id };
  },
);
