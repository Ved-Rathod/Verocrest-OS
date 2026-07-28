// @verocrest/domain-scoring — client-safe surface (types + constants).
// Server data access lives in './server'; the Server Action in './actions'.
// Fit + ICP-match + opportunity scoring for the Lead Intelligence Engine
// (docs/04 §5.3–5.5; Sprint 4.9; Amendment 011).
export { SCORE_VERSION } from './scoring/version';
export type {
  LeadScore,
  ScoreExplainability,
  ScoreOutcome,
  FitComponent,
  FitComponentKey,
  MatchSignal,
  TopSignal,
  IcpMatch,
} from './scoring/types';
