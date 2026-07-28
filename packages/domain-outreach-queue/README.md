# @verocrest/domain-outreach-queue

Materialized, write-locked next-best-action Outreach Queue (LIE).

**Owner:** founder · **Blueprint:** docs 03 §6.5; 04 §8.1; 09 §11 · **Amendment:** 012 · **Implemented:** Sprint 5.0 (slice of the frozen Sprint 7 LIE)

## What Sprint 5.0 delivers

- **Materialized queue** (`outreach_queue_items`): one row per lead, recomputed by
  the LIE. Ranked by a transient `effective_priority = opportunity_score ?? fit_score`
  (Amendment 012) — no stored priority column; `opportunity_score` holds the genuine
  value (NULL until Relationship Intelligence), never fabricated.
- **Deterministic NBA** (`nba.ts`): maps score/cooldown/disqualification to the frozen
  `next_best_action_enum`. Readiness-gated branches stay dormant until RI ships (D4).
- **`recommend-offer`** (docs/09 §11): structured, memory-grounded offer pick +
  rationale; degrades gracefully when the model is unavailable. Keyless Mock;
  OpenAI primary deferred (RN-001).
- **Queue explainability (D10):** `reasoning` jsonb records why the item holds its
  rank (priority basis + value) and why the NBA + recommended offer were chosen.
- **Snooze / Complete (D3):** realized through `domain-reminders` (system of record
  for follow-up state) + a service-role `cooldown_until` that drops the item from the
  active queue — **no** mutable status columns on the write-locked projection.
- **LIE write-lock (D5):** members SELECT; `recomputeQueueForLead` /
  `applyQueueCooldown` write via the service-role path, emitting `outreach.queue.updated`.
- **Event-driven refresh (D6):** recomputes on `lead.scored`; manual "Recalculate".

## Deferred (frozen homes)

Multi-step **sequencing** (Phase 2), **Relationship Intelligence** (`relationship.profile.recomputed`
trigger, Sprint 7), and the **`outreach.sent`** trigger (Sprint 9).

Public surface is `src/index.ts` (client-safe types), `./server` (data access),
`./actions` (Server Action). Internal folders are private per docs/03 §5.
