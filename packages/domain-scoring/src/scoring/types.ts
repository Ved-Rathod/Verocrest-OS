/**
 * Lead-scoring domain types (docs/04 §5.3–5.5 as amended by Amendment 011).
 * Keys mirror the frozen `lead_scores` columns.
 */

export type FitComponentKey = 'icp' | 'website' | 'enrichment';

/** One input dimension of the fit score, with its genuine availability. */
export type FitComponent = {
  key: FitComponentKey;
  label: string;
  /** True only when the dimension has a real, computed value (never fabricated). */
  available: boolean;
  /** 0–100 raw signal, or null when unavailable. */
  rawScore: number | null;
  /** Configured weight from the rubric's `fit_composition` (pre-renormalization). */
  baseWeight: number;
  /** Effective weight after renormalizing over available components (0 when absent). */
  effectiveWeight: number;
  /** Plain-language reason surfaced in explainability. */
  note: string;
};

/** A plain-language ICP hit/miss card (docs/04 §5.3 `icp_match_signals`). */
export type MatchSignal = {
  label: string;
  detail: string;
  hit: boolean;
};

/** Result of matching a lead against one ICP. */
export type IcpMatch = {
  icpId: string;
  icpName: string;
  /** 0–100. */
  score: number;
  signals: MatchSignal[];
};

/** A driving signal for the score (docs/04 §5.3 `top_signals`). */
export type TopSignal = {
  label: string;
  detail: string;
  direction: 'positive' | 'negative' | 'neutral';
};

/** The persisted lead score (read shape for the UI). */
export type LeadScore = {
  leadId: string;
  fitScore: number;
  readinessScore: number | null;
  opportunityScore: number | null;
  icpId: string | null;
  icpMatchScore: number | null;
  icpMatchSignals: MatchSignal[];
  scoreVersion: number;
  rubricVersion: number;
  topSignals: TopSignal[];
  explainability: ScoreExplainability;
  model: string;
  computedAt: string;
};

/** The `explainability` jsonb shape (honest availability per dimension). */
export type ScoreExplainability = {
  scoreVersion: number;
  fit: { score: number; components: FitComponent[] };
  readiness: { available: boolean; reason: string };
  opportunity: { available: boolean; reason: string };
  narrative: string;
  aiAvailable: boolean;
  aiConfidence: number | null;
};

/**
 * Outcome of a scoring attempt. `insufficient_signals` is a SCORING-SUBSYSTEM
 * concern (modified D7) — it never touches the CRM `lead_status_enum`.
 */
export type ScoreOutcome =
  | { status: 'scored'; score: LeadScore }
  | { status: 'insufficient_signals'; reason: string }
  | { status: 'lead_not_found' };
