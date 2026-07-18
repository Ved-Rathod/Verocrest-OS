import { z } from 'zod';
import { createSupabaseServerClient } from '@verocrest/platform-integrations/supabase/server';
import { createSupabaseServiceRoleClient } from '@verocrest/platform-integrations/supabase/service';
import type { WorkspaceContext } from '@verocrest/platform-tenancy/server';
import type { ActorType } from './envelope';

/**
 * Durable event journal read/replay helpers (docs/03 §8.10). Server-only. The
 * per-workspace reads (RLS-scoped) power inspection + audit trails; the
 * cross-workspace time-window read ({@link readJournalWindow}, service-role)
 * powers Sprint 3.2 reconciliation + the one-shot historical replay. All reads
 * are append-only consumers — the journal is never mutated (Sprint 3.2 decision #3).
 */

const JOURNAL_SELECT =
  'id, workspace_id, name, version, actor_type, actor_id, subject_type, subject_id, payload, correlation_id, causation_id, occurred_at, emitted_at';

const journalRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string().uuid(),
  name: z.string(),
  version: z.number().int(),
  actor_type: z.enum(['user', 'agent', 'system', 'integration']),
  actor_id: z.string(),
  subject_type: z.string(),
  subject_id: z.string().uuid().nullable(),
  payload: z.record(z.string(), z.unknown()),
  correlation_id: z.string().nullable(),
  causation_id: z.string().nullable(),
  occurred_at: z.string(),
  emitted_at: z.string(),
});

export type JournalEvent = {
  id: string;
  workspaceId: string;
  name: string;
  version: number;
  actorType: ActorType;
  actorId: string;
  subjectType: string;
  subjectId: string | null;
  payload: Record<string, unknown>;
  correlationId: string | null;
  causationId: string | null;
  occurredAt: string;
  emittedAt: string;
};

function toJournalEvent(row: z.infer<typeof journalRowSchema>): JournalEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    version: row.version,
    actorType: row.actor_type,
    actorId: row.actor_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    payload: row.payload,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    occurredAt: row.occurred_at,
    emittedAt: row.emitted_at,
  };
}

/**
 * Read journal events for the active workspace, chronological (occurred_at asc) so
 * the result is directly replay-ordered. Optional filters by event name / subject.
 */
export async function readJournal(
  ctx: WorkspaceContext,
  params: { name?: string; subjectType?: string; subjectId?: string; limit?: number } = {},
): Promise<JournalEvent[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('event_journal')
    .select(JOURNAL_SELECT)
    .eq('workspace_id', ctx.workspaceId);

  if (params.name) query = query.eq('name', params.name);
  if (params.subjectType) query = query.eq('subject_type', params.subjectType);
  if (params.subjectId) query = query.eq('subject_id', params.subjectId);

  const { data, error } = await query
    .order('occurred_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(Math.min(params.limit ?? 200, 1000));

  if (error) throw error;
  return (data ?? []).map((r) => toJournalEvent(journalRowSchema.parse(r)));
}

/** All journal events about a specific subject, chronological (audit trail per subject). */
export async function readJournalForSubject(
  ctx: WorkspaceContext,
  subjectType: string,
  subjectId: string,
): Promise<JournalEvent[]> {
  return readJournal(ctx, { subjectType, subjectId });
}

/**
 * Cross-workspace, time-window read for reconciliation + historical replay
 * (Sprint 3.2 decision #3). Runs with the service role (no request/user context —
 * this is a cron / CLI path), reading every workspace's events in `[since, until)`
 * by `emitted_at`. Re-emission is made safe by the ULID `id` idempotency key, so
 * an overlapping window never double-delivers. The journal itself is untouched.
 */
export async function readJournalWindow(params: {
  since: string;
  until?: string;
  limit?: number;
}): Promise<JournalEvent[]> {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase.from('event_journal').select(JOURNAL_SELECT).gte('emitted_at', params.since);

  if (params.until) query = query.lt('emitted_at', params.until);

  const { data, error } = await query
    .order('emitted_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(Math.min(params.limit ?? 5000, 20000));

  if (error) throw error;
  return (data ?? []).map((r) => toJournalEvent(journalRowSchema.parse(r)));
}
