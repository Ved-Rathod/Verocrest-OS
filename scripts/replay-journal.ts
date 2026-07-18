/**
 * One-shot replay of historical journal events onto the bus (Sprint 3.2, DoD item 2).
 * Events written before the runtime went live (Sprint 3.1) — or any events a
 * post-commit send missed — are re-emitted. The envelope ULID `id` dedupes anything
 * Inngest already delivered, so this is safe to run more than once (decision #3).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_* (service-role read is
 * cross-workspace). Run from the repo root, e.g.:
 *
 *   npx tsx --env-file=apps/web/.env.local scripts/replay-journal.ts [sinceISO]
 *
 * `sinceISO` defaults to the epoch (all history).
 */
import { replayEvents } from '@verocrest/platform-event-bus';
import { readJournalWindow } from '@verocrest/platform-event-bus/server';
import { registerBusPublisher } from '@verocrest/platform-jobs/server';

async function main(): Promise<void> {
  const since = process.argv[2] ?? new Date(0).toISOString();
  registerBusPublisher();
  const events = await readJournalWindow({ since, limit: 20000 });
  const published = await replayEvents(events);
  console.log(`Replayed ${published} journal event(s) emitted since ${since}.`);
}

main().catch((err: unknown) => {
  console.error('Journal replay failed:', err);
  process.exit(1);
});
