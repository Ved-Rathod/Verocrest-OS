// @verocrest/domain-website-intelligence — client-safe surface (types + validation).
// Server data access is in './server'; Server Actions in './actions'.
export {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  AUDIT_STATUSES,
  type Audit,
  type AuditListItem,
  type AuditFinding,
  type Finding,
  type FindingCategory,
  type FindingSeverity,
  type AuditStatus,
} from './audit/types';
export { analyzeInputSchema, withScheme, type AnalyzeInput } from './audit/validation';
export type { WebsiteSignals } from './analysis/analyzers';
