# @verocrest/domain-scoring

Fit + ICP-match + opportunity scoring for the Lead Intelligence Engine (LIE).

**Owner:** founder · **Blueprint:** docs 04 §5.3–5.5; 09 §4.3, §11 · **Amendment:** 011 · **Implemented:** Sprint 4.9 (slice of the frozen Sprint 7 LIE)

## What Sprint 4.9 delivers

- **Deterministic engine** (`score_version 1`): `fit = ICP match + website intelligence`
  (+ enrichment when it exists), composed via the active rubric's `fit_composition`
  weights **renormalized over the components that genuinely exist**. A missing
  substrate contributes no weight — it never biases the score.
- **Deterministic ICP matcher** (`icp-match.ts`): industry / geography / size /
  seniority over `icps.criteria` + target columns, best-match-wins (docs/04 §5.9),
  disqualifiers force 0. No LLM (D2/D3).
- **`score-lead` explainability** (docs/09 §11): the Router produces the
  plain-language summary + signals + confidence; the numbers stay deterministic
  (D2). Degrades gracefully if the model is unavailable (F-SCORE-002) — the score
  still persists with a deterministic explanation.
- **Honest absence (Amendment 011 / modified D4):** `readiness_score` and
  `opportunity_score` are `NULL` because Relationship Intelligence
  (`relationship_profiles`) is not built yet. Never fabricated, never neutral-filled.
- **Score versioning (D9):** every row records `score_version` so historical scores
  stay explainable after future algorithm revisions. Sprint 7 fills readiness /
  opportunity under a newer version **without reinterpreting** version-1 rows.
- **LIE write-lock (D5):** members `SELECT`; the engine writes `lead_scores` /
  `lead_score_history` through the service-role path (no write policy), emitting
  `lead.scored` via the atomic `score_lead_with_event` RPC.

## Trigger

Sprint 4.9 scores via the member-authorized `scoreLeadAction` (Server Action).
**Auto-triggering** off the `lead.ingested → lead.enriched → lead.scored →
outreach.queue.updated` event chain is a Sprint 7 item (roadmap S7 #6) — deferred
per D1, alongside enrichment, Relationship Intelligence, and the Outreach Queue.

Public surface is `src/index.ts` (client-safe types), `./server` (data access),
`./actions` (Server Action). Internal folders are private per docs/03 §5.
