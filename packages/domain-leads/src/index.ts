// @verocrest/domain-leads — Leads lifecycle (Module 2, docs/06 §3).
// Landed Sprint 2.3 per amended docs/04 §5.1 (Amendment 001 + 002).
// LIE scoring (fit/readiness/opportunity) lands Sprint 7 in domain-scoring.
//
// CLIENT-SAFE surface. Server Actions: './actions'. RSC reads: './server'.
export {
  LEAD_STATUSES,
  MANUAL_LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  LEAD_CURRENCIES,
} from './lead/enums';
export type { LeadStatus, LeadPriority } from './lead/enums';
export { leadContactName } from './lead/types';
export type { Lead, LeadDetail, LeadPage, LeadContactRef, LeadCompanyRef } from './lead/types';
export { leadInputSchema, leadListParamsSchema, toFieldErrors } from './lead/validation';
export type { LeadInput, LeadListParams } from './lead/validation';
