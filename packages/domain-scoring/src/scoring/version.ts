/**
 * Scoring ALGORITHM version (Amendment 011, D9) — distinct from the workspace
 * `rubric_version`. Persisted on every `lead_scores` / `lead_score_history` row so
 * a historical score stays explainable after future algorithm revisions. When
 * Sprint 7 adds Relationship Intelligence (readiness + opportunity), it computes
 * under a NEWER version on new scores; version-1 rows are never reinterpreted.
 *
 * Version 1 (Sprint 4.9): deterministic fit = ICP match + website intelligence
 * (+ enrichment when it exists), renormalized over available components. Readiness
 * and opportunity are NULL (no Relationship Intelligence substrate yet).
 */
export const SCORE_VERSION = 1;
