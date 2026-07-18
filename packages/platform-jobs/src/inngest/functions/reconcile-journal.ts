import { replayEvents } from '@verocrest/platform-event-bus';
import { readJournalWindow, type JournalEvent } from '@verocrest/platform-event-bus/server';
import { inngest } from '../client';

/**
 * Nightly reconciliation (docs/10 §11.3). Reads the journal for a window that
 * comfortably covers a day's worth of runs and re-emits every event; the ULID
 * `id` makes already-delivered events no-ops (Sprint 3.2 decision #3 —
 * append-only, no cursor/flag). This is the delivery safety net for any
 * post-commit send that failed after its transaction committed.
 */
const WINDOW_HOURS = 25; // nightly cadence + 1h overlap so a missed night is still covered next run

export const reconcileJournal = inngest.createFunction(
  { id: 'reconcile-journal', name: 'Reconcile event journal' },
  { cron: '0 3 * * *' }, // 03:00 UTC nightly (docs/03 §8.9 nightly slot)
  async ({ logger }) => {
    const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
    const events: JournalEvent[] = await readJournalWindow({ since });
    const published = await replayEvents(events);
    logger.info('journal reconciliation complete', {
      since,
      scanned: events.length,
      published,
    });
    return { since, scanned: events.length, published };
  },
);
