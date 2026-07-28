// @verocrest/domain-scoring server surface (docs/04 §5.3–5.5).
// `scoreLeadNow` runs under the service role (LIE write-locked path); `getLeadScore`
// is an RLS-scoped member read for the UI.
export { scoreLeadNow, type ScoreLeadParams } from './scoring/service';
export { getLeadScore } from './scoring/queries';
export type { LeadScore, ScoreOutcome, ScoreExplainability } from './scoring/types';
